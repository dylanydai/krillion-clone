import { GameError } from "./errors.ts";
import { ROUNDS_PER_GAME } from "./game-config.ts";
import { createRoom, currentRound, customizeFish, finishAnswer, joinRoom, member, nextRound, publicRoom, rematch, requireHost, reserveAnswer, settleRound, skipAnswer, startGame } from "./game.ts";
import { parseFishColor, type FishColor } from "./fish.ts";
import { judgeAnswer } from "./judge.ts";
import { updateRoom } from "./store.ts";
import type { RoomStore } from "./store.ts";
import type { Attempt, Room, RoomView } from "./types.ts";

export type Action =
  | { action: "join"; name: string }
  | { action: "customize"; color: FishColor }
  | { action: "start" | "next" | "rematch" }
  | { action: "answer"; answer: string; roundIndex: number }
  | { action: "retry"; roundIndex: number }
  | { action: "skip"; roundIndex: number };

export type Judge = typeof judgeAnswer;

export async function newGame(store: RoomStore, name: string, token: string, model: string): Promise<RoomView> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const room = createRoom(name, token, model, Date.now());
    if (await store.create(room)) return publicRoom(room, token, Date.now());
  }
  throw new GameError("ROOM_BUSY", "Could not allocate a room code. Try again.", 503);
}

export async function readGame(store: RoomStore, code: string, token: string): Promise<RoomView> {
  let room = await store.read(code);
  if (room === null) throw new GameError("ROOM_NOT_FOUND", "This room does not exist or has expired.", 404);
  member(room, token);
  const before = JSON.stringify(room);
  settleRound(room, Date.now());
  if (before !== JSON.stringify(room)) room = (await updateRoom(store, code, (value: Room): void => settleRound(value, Date.now()))).room;
  return publicRoom(room, token, Date.now());
}

export async function submitAnswer(options: { store: RoomStore; code: string; token: string; action: Extract<Action, { action: "answer" | "retry" }>; judge?: Judge }): Promise<RoomView> {
  const { store, code, token, action, judge = judgeAnswer } = options;
  const reserved = await updateRoom(store, code, (room: Room): { playerId: string; attempt: Attempt } => {
    settleRound(room, Date.now());
    return reserveAnswer({ room, token, roundIndex: action.roundIndex, answer: action.action === "answer" ? action.answer : "", now: Date.now(), retry: action.action === "retry" });
  });
  const { playerId, attempt } = reserved.value;
  const judgment = await judge({ answer: attempt.answer, categoryId: currentRound(reserved.room).categoryId, model: reserved.room.model, cachedScores: reserved.room.scores });
  const result = await updateRoom(store, code, (room: Room): void => finishAnswer({ room, roundIndex: action.roundIndex, playerId, attemptId: attempt.id, judgment, now: Date.now() }));
  return publicRoom(result.room, token, Date.now());
}

export async function act(store: RoomStore, code: string, token: string, action: Action): Promise<RoomView> {
  if (action.action === "answer" || action.action === "retry") return submitAnswer({ store, code, token, action });
  const result = await updateRoom(store, code, (room: Room): void => {
    settleRound(room, Date.now());
    switch (action.action) {
      case "join": joinRoom(room, token, action.name); break;
      case "customize": customizeFish(room, token, action.color); break;
      case "start": {
        requireHost(room, token);
        if (!process.env.AI_GATEWAY_API_KEY) throw new GameError("JUDGE_UNAVAILABLE", "Set AI_GATEWAY_API_KEY on the server before starting a game.", 503);
        startGame(room, token, Date.now()); break;
      }
      case "next": nextRound(room, token, Date.now()); break;
      case "rematch": rematch(room, token); break;
      case "skip": skipAnswer(room, token, action.roundIndex, Date.now()); break;
    }
  });
  return publicRoom(result.room, token, Date.now());
}

export function parseAction(value: unknown): Action {
  if (typeof value !== "object" || value === null || !("action" in value) || typeof value.action !== "string") throw new GameError("INVALID_REQUEST", "The request needs an action.");
  const body = value as Record<string, unknown>;
  const action = body.action;
  if (action === "start" || action === "next" || action === "rematch") return { action };
  if (action === "join" && typeof body.name === "string") return { action, name: body.name };
  if (action === "customize") {
    return { action, color: parseFishColor(body.color) };
  }
  if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex) || body.roundIndex < 0 || body.roundIndex >= ROUNDS_PER_GAME) throw new GameError("INVALID_REQUEST", "The request needs a valid round number.");
  const roundIndex = body.roundIndex;
  if (action === "answer" && typeof body.answer === "string") return { action, answer: body.answer, roundIndex };
  if (action === "retry" || action === "skip") return { action, roundIndex };
  throw new GameError("INVALID_REQUEST", "The action or its fields are invalid.");
}
