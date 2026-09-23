import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { GameError } from "./errors.ts";
import { validateOrigin } from "./origin.ts";

const COOKIE_NAME = "krillion_session";

export async function session(create: boolean = false): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME);
  if (existing !== undefined && /^[a-f0-9]{64}$/.test(existing.value)) return existing.value;
  if (!create) throw new GameError("NOT_JOINED", "Join this room to play.", 401);
  const token = randomBytes(32).toString("hex");
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return token;
}

export async function body(request: Request): Promise<unknown> {
  validateOrigin(request);
  const text = await request.text();
  if (text.length > 2048) throw new GameError("REQUEST_TOO_LARGE", "The submitted request is too large.", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new GameError("INVALID_REQUEST", "Send a valid JSON request.");
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof GameError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("Unhandled game request failure", error);
  return Response.json({ error: { code: "SERVER_ERROR", message: "The server could not finish that action. Refresh the room and retry." } }, { status: 500 });
}
