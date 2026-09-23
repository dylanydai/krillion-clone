import { apiError, body, session } from "../../../lib/http";
import { cleanName } from "../../../lib/game";
import { GameError } from "../../../lib/errors";
import { newGame } from "../../../lib/service";
import { roomStore } from "../../../lib/store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await body(request);
    if (typeof input !== "object" || input === null || !("name" in input)) throw new GameError("INVALID_NAME", "Enter your name.");
    const name = cleanName(input.name);
    const model = process.env.JEV_MODEL === undefined ? "typesafe-ai/jev" : process.env.JEV_MODEL;
    const room = await newGame(roomStore(), name, await session(true), model);
    return Response.json(room, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return apiError(error);
  }
}
