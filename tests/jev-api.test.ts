import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { GameError } from "../lib/errors.ts";
import { evaluateJev, jevModel, judgeAnswer, requireJevKey } from "../lib/judge.ts";
import { createRoom } from "../lib/game.ts";
import { act } from "../lib/service.ts";
import { memoryStore } from "../lib/store.ts";

function setEnvironment(t: TestContext, name: string, value: string | undefined): void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after((): void => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test("direct Jev transport authenticates and preserves relevance and scoring", async (t: TestContext): Promise<void> => {
  setEnvironment(t, "TYPESAFE_API_KEY", "test-typesafe-key");
  setEnvironment(t, "AI_GATEWAY_API_KEY", "unused-gateway-key");
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit): Promise<Response> => {
    assert.equal(input, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { Authorization: "Bearer test-typesafe-key", "Content-Type": "application/json" });
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(typeof init.body, "string");
    const request = JSON.parse(init.body as string) as { model: string; state: Record<string, unknown>; questions: Record<string, unknown> };
    assert.equal(request.model, "jev-latest");
    if ("relevance" in request.questions) {
      calls.push("relevance");
      assert.equal(request.state.item, "Uiua");
      return Response.json({ answers: { relevance: { type: "choice", choice: "yes", probabilities: { yes: 1, no: 0 }, confidence: 1 } } });
    }
    calls.push("niche");
    return Response.json({ answers: { niche: { type: "score", score: 3, probabilities: { "0": 0, "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 }, confidence: 1 } } });
  });
  const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "jev-latest", cachedScores: {}, scoringRuns: 3 });
  assert.equal(result.status, "scored");
  assert.equal(result.score, 0.6);
  assert.deepEqual(calls, ["relevance", "niche", "niche", "niche"]);
});

test("Gateway credentials cannot replace a missing TypeSafe key", async (t: TestContext): Promise<void> => {
  setEnvironment(t, "AI_GATEWAY_API_KEY", "unused-gateway-key");
  setEnvironment(t, "TYPESAFE_API_KEY", undefined);
  const fetch = t.mock.method(globalThis, "fetch", async (): Promise<Response> => { throw new Error("Unexpected network request"); });
  for (const key of [undefined, "", "  "]) {
    if (key === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = key;
    assert.throws(requireJevKey, /Set TYPESAFE_API_KEY/);
    await assert.rejects(evaluateJev({}, {}, "jev-latest"), /Set TYPESAFE_API_KEY/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("direct model defaults and overrides use the same configuration", (t: TestContext): void => {
  setEnvironment(t, "JEV_MODEL", undefined);
  assert.equal(jevModel(), "jev-latest");
  process.env.JEV_MODEL = "jev-1.13.0";
  assert.equal(jevModel(), "jev-1.13.0");
  process.env.JEV_MODEL = " ";
  assert.throws(jevModel, /JEV_MODEL must be a TypeSafe model name/);
});

test("game start requires the direct key and keeps the lobby on failure", async (t: TestContext): Promise<void> => {
  setEnvironment(t, "TYPESAFE_API_KEY", undefined);
  setEnvironment(t, "AI_GATEWAY_API_KEY", "unused-gateway-key");
  const store = memoryStore();
  const room = createRoom("Host", "host", "jev-latest", Date.now());
  await store.create(room);
  await assert.rejects(act(store, room.code, "host", { action: "start" }), /Set TYPESAFE_API_KEY/);
  assert.equal((await store.read(room.code))?.phase, "lobby");
  process.env.TYPESAFE_API_KEY = "test-key";
  await act(store, room.code, "host", { action: "start" });
  assert.notEqual((await store.read(room.code))?.phase, "lobby");
});

test("TypeSafe HTTP errors remain explicit even with non-JSON bodies", async (t: TestContext): Promise<void> => {
  setEnvironment(t, "TYPESAFE_API_KEY", "test-key");
  let status = 401;
  t.mock.method(globalThis, "fetch", async (): Promise<Response> => new Response("upstream error", { status }));
  for (const [code, message] of [[401, /rejected TYPESAFE_API_KEY/], [429, /temporarily busy/], [529, /temporarily busy/], [422, /HTTP 422/]] as const) {
    status = code;
    await assert.rejects(evaluateJev({}, {}, "jev-latest"), (error: unknown): boolean => {
      assert.ok(error instanceof GameError);
      assert.equal(error.code, "JUDGE_UNAVAILABLE");
      assert.match(error.message, message);
      return true;
    });
  }
});

test("malformed successful responses and network failures cannot award scores", async (t: TestContext): Promise<void> => {
  setEnvironment(t, "TYPESAFE_API_KEY", "test-key");
  let respond: () => Promise<Response> = async (): Promise<Response> => new Response("invalid JSON");
  t.mock.method(globalThis, "fetch", (): Promise<Response> => respond());
  await assert.rejects(evaluateJev({}, {}, "jev-latest"), /invalid JSON/);
  respond = async (): Promise<Response> => Response.json({ answers: [] });
  await assert.rejects(evaluateJev({}, {}, "jev-latest"), /Invalid answers/);
  respond = async (): Promise<Response> => { throw new TypeError("fetch failed"); };
  await assert.rejects(evaluateJev({}, {}, "jev-latest"), /Could not connect/);
  respond = async (): Promise<Response> => { throw new DOMException("timeout", "TimeoutError"); };
  await assert.rejects(evaluateJev({}, {}, "jev-latest"), /timed out/);
  respond = async (): Promise<Response> => { throw new Error("Unexpected programming error"); };
  await assert.rejects(evaluateJev({}, {}, "jev-latest"), /Unexpected programming error/);
});
