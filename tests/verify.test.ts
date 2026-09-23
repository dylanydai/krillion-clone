import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { verifyAnswer } from "../lib/verify.ts";

const INPUT = { answer: "Chinese Catan", category: { id: "board-games" as const, title: "Board games", prompt: "Name a board game" } };

function credentials(context: TestContext): void {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key";
  context.after((): void => {
    if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previous;
  });
}

test("verifier uses the Gateway key, exact answer and category without search tools", async (context: TestContext): Promise<void> => {
  credentials(context);
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit): Promise<Response> => {
    assert.equal(url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-key");
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, process.env.VERIFIER_MODEL ?? "alibaba/qwen-3-14b");
    assert.deepEqual(JSON.parse(body.messages[1].content), INPUT);
    assert.match(body.messages[0].content, /Chinese Catan/);
    assert.match(body.messages[0].content, /untrusted data/);
    assert.equal(Object.hasOwn(body, "tools"), false);
    assert.match(body.messages[0].content, /using your own knowledge/);
    assert.equal(body.max_tokens, 16);
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "NO" } }] });
  });
  assert.equal(await verifyAnswer(INPUT), false);
});

test("only complete YES or NO responses become verdicts", async (context: TestContext): Promise<void> => {
  credentials(context);
  for (const [content, verdict] of [["YES", true], [" NO\n", false]] as const) {
    context.mock.method(globalThis, "fetch", async (): Promise<Response> => Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    assert.equal(await verifyAnswer(INPUT), verdict);
  }
  for (const payload of [null, {}, { choices: [] }, { choices: [{ finish_reason: "length", message: { content: "YES" } }] }, ...[null, "Yes", "YES because it exists", "UNKNOWN"].map((content: string | null): object => ({ choices: [{ finish_reason: "stop", message: { content } }] }))]) {
    context.mock.method(globalThis, "fetch", async (): Promise<Response> => Response.json(payload));
    await assert.rejects(verifyAnswer(INPUT), { code: "JUDGE_UNAVAILABLE" });
  }
});

test("HTTP, billing, network, timeout and JSON failures never become NO", async (context: TestContext): Promise<void> => {
  credentials(context);
  for (const status of [429, 500]) {
    context.mock.method(globalThis, "fetch", async (): Promise<Response> => Response.json({ error: "failed" }, { status }));
    await assert.rejects(verifyAnswer(INPUT), { code: "JUDGE_UNAVAILABLE" });
  }
  context.mock.method(globalThis, "fetch", async (): Promise<Response> => Response.json({ error: { type: "customer_verification_required" } }, { status: 403 }));
  await assert.rejects(verifyAnswer(INPUT), { code: "JUDGE_BILLING_REQUIRED" });
  context.mock.method(globalThis, "fetch", async (): Promise<Response> => new Response("not JSON"));
  await assert.rejects(verifyAnswer(INPUT), { code: "JUDGE_UNAVAILABLE" });
  for (const error of [new TypeError("network"), new DOMException("timeout", "TimeoutError")]) {
    context.mock.method(globalThis, "fetch", async (): Promise<Response> => { throw error; });
    await assert.rejects(verifyAnswer(INPUT), { code: "JUDGE_UNAVAILABLE" });
  }
});
