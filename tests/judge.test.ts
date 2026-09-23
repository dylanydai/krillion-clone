import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeAnswer, scoreItem } from "../lib/judge.ts";
import type { Evaluate } from "../lib/judge.ts";
import { GameError } from "../lib/errors.ts";

function evaluator(calls: string[]): Evaluate {
  return async (_state, questions): Promise<Record<string, unknown>> => {
    calls.push(...Object.keys(questions));
    if ("relevance" in questions) return { relevance: { type: "choice", choice: "yes" } };
    return { niche: { type: "score", score: 3, probabilities: { "0": 0, "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 } } };
  };
}

test("relevance and rarity requests start concurrently", async (): Promise<void> => {
  const calls: string[] = [];
  let releaseProbe!: (value: Record<string, unknown>) => void;
  const probe = new Promise<Record<string, unknown>>((resolve): void => { releaseProbe = resolve; });
  const score = evaluator(calls);
  const evaluate: Evaluate = async (state, questions, model): Promise<Record<string, unknown>> => {
    if ("relevance" in questions) { calls.push("relevance"); return probe; }
    return score(state, questions, model);
  };
  const pending = judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, evaluate });
  assert.deepEqual(calls, ["relevance", "niche"]);
  releaseProbe({ relevance: { type: "choice", choice: "yes" } });
  assert.equal((await pending).score, 0.6);
});

test("rejected and malformed probes cannot award fresh or cached points", async (): Promise<void> => {
  const caches: Record<string, number>[] = [{}, { "languages:nonsense": 1 }];
  for (const cachedScores of caches) {
    for (const choice of ["no", "maybe", undefined]) {
      const evaluate: Evaluate = async (state, questions, model): Promise<Record<string, unknown>> => {
        if ("relevance" in questions) return { relevance: { type: "choice", choice } };
        return evaluator([])(state, questions, model);
      };
      const result = await judgeAnswer({ answer: "nonsense", categoryId: "languages", model: "test", cachedScores, evaluate });
      assert.equal(result.score, null);
      assert.equal(result.status, choice === "no" ? "rejected" : "retryable_error");
      assert.equal(result.relevancy, choice === "no" ? false : null);
    }
  }
});

test("probe outages do not accept a successfully graded answer", async (): Promise<void> => {
  const evaluate: Evaluate = async (state, questions, model): Promise<Record<string, unknown>> => {
    if ("relevance" in questions) throw new GameError("JUDGE_UNAVAILABLE", "Probe unavailable", 503);
    return evaluator([])(state, questions, model);
  };
  const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, evaluate });
  assert.equal(result.status, "retryable_error");
  assert.equal(result.score, null);
  assert.equal(result.relevancy, null);
  assert.equal(result.message, "Probe unavailable");
});

test("normalized rarity scores are reused only within their category", async (): Promise<void> => {
  for (const categoryId of ["languages", "board-games"] as const) {
    const calls: string[] = [];
    const result = await judgeAnswer({ answer: "  GO  ", categoryId, model: "test", cachedScores: { "languages:go": 0.25 }, evaluate: evaluator(calls) });
    assert.deepEqual(calls, categoryId === "languages" ? ["relevance"] : ["relevance", "niche"]);
    assert.equal(result.score, categoryId === "languages" ? 0.25 : 0.6);
  }
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
