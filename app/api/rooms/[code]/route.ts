import { cleanCode } from "../../../../lib/game";
import { apiError, body, session } from "../../../../lib/http";
import { act, parseAction, readGame } from "../../../../lib/service";
import { roomStore } from "../../../../lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const code = cleanCode((await context.params).code);
    return Response.json(await readGame(roomStore(), code, await session()), { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const code = cleanCode((await context.params).code);
    const action = parseAction(await body(request));
    const token = await session(action.action === "join");
    return Response.json(await act(roomStore(), code, token, action), { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return apiError(error);
  }
}
