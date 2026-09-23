import { GameError } from "./errors.ts";

export function validateOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const host = request.headers.get("host");
  if (host === null || origin !== `${new URL(request.url).protocol}//${host}`) {
    throw new GameError("INVALID_ORIGIN", "Send the request from this game.", 403);
  }
}
