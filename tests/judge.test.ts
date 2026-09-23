import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeAnswer, scoreItem } from "../lib/judge.ts";
import type { Evaluate } from "../lib/judge.ts";
import { GameError } from "../lib/errors.ts";
import type { Verify } from "../lib/verify.ts";

function evaluator(calls: string[]): Evaluate {
  return async (_state, questions): Promise<Record<string, unknown>> => {
    calls.push(...Object.keys(questions));
    return { niche: { type: "score", score: 3, probabilities: { "0": 0, "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 } } };
  };
}

test("an obscure verified answer reaches Jev only for rarity", async (): Promise<void> => {
  const calls: string[] = [];
  const verify: Verify = async ({ answer, category }): Promise<boolean> => {
    assert.equal(answer, "Uiua");
    assert.equal(category.prompt, "Name a programming language");
    calls.push("verify");
    return true;
  };
  const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, verify, evaluate: evaluator(calls) });
  assert.deepEqual(calls, ["verify", "niche"]);
  assert.equal(result.score, 0.6);
});

test("NO rejects the answer without scoring, even when a score is cached", async (): Promise<void> => {
  const calls: string[] = [];
  const result = await judgeAnswer({ answer: "Chinese Catan", categoryId: "board-games", model: "test", cachedScores: { "board-games:chinese catan": 1 }, verify: async (): Promise<boolean> => false, evaluate: evaluator(calls) });
  assert.deepEqual(calls, []);
  assert.equal(result.status, "rejected");
  assert.equal(result.relevancy, false);
  assert.equal(result.score, null);
  assert.equal(result.errorCode, "INVALID_ITEM");
});

test("verification failures stay retryable and never invoke Jev", async (): Promise<void> => {
  for (const code of ["JUDGE_UNAVAILABLE", "JUDGE_BILLING_REQUIRED"]) {
    const calls: string[] = [];
    const verify: Verify = async (): Promise<boolean> => { throw new GameError(code, "Verification failed", 503); };
    const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, verify, evaluate: evaluator(calls) });
    assert.deepEqual(calls, []);
    assert.equal(result.status, "retryable_error");
    assert.equal(result.errorCode, code);
    assert.equal(result.score, null);
  }
});

test("unexpected verifier errors propagate", async (): Promise<void> => {
  await assert.rejects(judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, verify: async (): Promise<boolean> => { throw new Error("bug"); } }), /bug/);
});

test("verified names reuse normalized scores only within their category", async (): Promise<void> => {
  for (const categoryId of ["languages", "board-games"] as const) {
    const calls: string[] = [];
    const result = await judgeAnswer({ answer: "  GO  ", categoryId, model: "test", cachedScores: { "languages:go": 0.25 }, verify: async (): Promise<boolean> => true, evaluate: evaluator(calls) });
    assert.deepEqual(calls, categoryId === "languages" ? [] : ["niche"]);
    assert.equal(result.score, categoryId === "languages" ? 0.25 : 0.6);
  }
});

test("every submission is freshly verified even with an existing rarity score", async (): Promise<void> => {
  let verifications = 0;
  const verify: Verify = async (): Promise<boolean> => {
    verifications += 1;
    return true;
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: { "languages:uiua": 0.9 }, verify });
  }
  assert.equal(verifications, 2);
});

test("a scoring outage preserves accepted relevance with no score", async (): Promise<void> => {
  const item = { id: "languages:python", name: "Python" };
  const evaluate: Evaluate = async (): Promise<Record<string, unknown>> => { throw new GameError("JUDGE_UNAVAILABLE", "Unavailable", 503); };
  const result = await scoreItem({ item, categoryId: "languages", model: "test", evaluate });
  assert.equal(result.status, "retryable_error");
  assert.equal(result.relevancy, true);
  assert.equal(result.score, null);
});

test("malformed and uncertain scores never become game points", async (): Promise<void> => {
  const item = { id: "languages:python", name: "Python" };
  for (const score of [undefined, -1, 6, "3", Number.NaN]) {
    const evaluate: Evaluate = async (): Promise<Record<string, unknown>> => ({ niche: { type: "score", score } });
    const result = await scoreItem({ item, categoryId: "languages", model: "test", evaluate });
    assert.equal(result.score, null);
    assert.equal(result.errorCode, "JUDGE_UNAVAILABLE");
  }
  const evaluate: Evaluate = async (): Promise<Record<string, unknown>> => ({ niche: { type: "score", score: 2.5, probabilities: { "0": 0.5, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0.5 } } });
  assert.equal((await scoreItem({ item, categoryId: "languages", model: "test", evaluate })).errorCode, "SCORE_UNCERTAIN");
});
