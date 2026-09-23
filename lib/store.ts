import { GameError } from "./errors.ts";
import type { Room } from "./types.ts";

const ROOM_TTL_SECONDS = 86_400;
const CAS_ATTEMPTS = 12;

export type RoomStore = {
  read: (code: string) => Promise<Room | null>;
  create: (room: Room) => Promise<boolean>;
  replace: (room: Room, version: number) => Promise<boolean>;
};

type MemoryEntry = { room: Room; expiresAt: number };

export function memoryStore(entries: Map<string, MemoryEntry> = new Map<string, MemoryEntry>()): RoomStore {
  function readEntry(code: string): Room | null {
    const entry = entries.get(code);
    if (entry === undefined) return null;
    if (Date.now() >= entry.expiresAt) {
      entries.delete(code);
      return null;
    }
    return structuredClone(entry.room);
  }
  return {
    read: async (code: string): Promise<Room | null> => readEntry(code),
    create: async (room: Room): Promise<boolean> => {
      if (readEntry(room.code) !== null) return false;
      entries.set(room.code, { room: structuredClone(room), expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
      return true;
    },
    replace: async (room: Room, version: number): Promise<boolean> => {
      if (readEntry(room.code)?.version !== version) return false;
      entries.set(room.code, { room: structuredClone(room), expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
      return true;
    },
  };
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new GameError("STORAGE_UNAVAILABLE", "Set the Upstash Redis REST URL and token on the server.", 503);
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(5000) });
  } catch (error: unknown) {
    throw new GameError("STORAGE_UNAVAILABLE", `Could not reach room storage (${error instanceof Error ? error.name : "network error"}). Retry the action.`, 503);
  }
  if (!response.ok) throw new GameError("STORAGE_UNAVAILABLE", `Room storage returned HTTP ${response.status}.`, 503);
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("result" in payload) || "error" in payload) {
    throw new GameError("STORAGE_UNAVAILABLE", "Room storage returned an invalid response.", 503);
  }
  return payload.result;
}

const CAS_SCRIPT = "local old = redis.call('GET', KEYS[1]); if not old then return 0 end; if cjson.decode(old).version ~= tonumber(ARGV[1]) then return 0 end; redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1";

const redisStore: RoomStore = {
  read: async (code: string): Promise<Room | null> => {
    const value = await redis(["GET", `krillion:room:${code}`]);
    if (value === null) return null;
    if (typeof value !== "string") throw new GameError("STORAGE_UNAVAILABLE", "Invalid room data in storage.", 503);
    const room: Room = JSON.parse(value) as Room;
    if (room.code !== code || !Number.isInteger(room.version)) throw new GameError("STORAGE_UNAVAILABLE", "Invalid room record in storage.", 503);
    return room;
  },
  create: async (room: Room): Promise<boolean> => {
    const result = await redis(["SET", `krillion:room:${room.code}`, JSON.stringify(room), "EX", ROOM_TTL_SECONDS, "NX"]);
    if (result !== null && result !== "OK") throw new GameError("STORAGE_UNAVAILABLE", "Room storage returned an invalid create result.", 503);
    return result === "OK";
  },
  replace: async (room: Room, version: number): Promise<boolean> => {
    const result = await redis(["EVAL", CAS_SCRIPT, 1, `krillion:room:${room.code}`, version, JSON.stringify(room), ROOM_TTL_SECONDS]);
    if (result !== 0 && result !== 1) throw new GameError("STORAGE_UNAVAILABLE", "Room storage returned an invalid update result.", 503);
    return result === 1;
  },
};

const globalState = globalThis as typeof globalThis & { krillionMemoryStore?: RoomStore };

export function roomStore(): RoomStore {
  if (process.env.ROOM_STORE === "redis") return redisStore;
  if (process.env.ROOM_STORE === "memory" && !process.env.VERCEL && process.env.NODE_ENV !== "production") {
    if (globalState.krillionMemoryStore === undefined) globalState.krillionMemoryStore = memoryStore();
    return globalState.krillionMemoryStore;
  }
  throw new GameError("STORAGE_UNAVAILABLE", "Configure ROOM_STORE=redis for deployment, or ROOM_STORE=memory for local development.", 503);
}

export async function updateRoom<T>(store: RoomStore, code: string, change: (room: Room) => T): Promise<{ room: Room; value: T }> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const room = await store.read(code);
    if (room === null) throw new GameError("ROOM_NOT_FOUND", "This room does not exist or has expired.", 404);
    const version = room.version;
    const value = change(room);
    room.version = version + 1;
    if (await store.replace(room, version)) return { room, value };
  }
  throw new GameError("ROOM_BUSY", "The room is busy. Retry your action.", 409);
}
