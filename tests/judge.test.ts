import { test } from "node:test";
import assert from "node:assert/strict";
import { averageScores, checkRelevance, evaluateTrials, judgeAnswer, scoreItem, scoreJury } from "../lib/judge.ts";
import type { Evaluate } from "../lib/judge.ts";
import { GameError } from "../lib/errors.ts";
import type { Judgment } from "../lib/types.ts";

function evaluator(calls: string[]): Evaluate {
  return async (_state, questions): Promise<Record<string, unknown>> => {
    calls.push(...Object.keys(questions));
    if ("relevance" in questions) return { relevance: { type: "choice", choice: "yes" } };
    return { niche: { type: "score", score: 3, probabilities: { "0": 0, "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 } } };
  };
}

test("custom question relevance uses the game probe without rarity scoring", async (): Promise<void> => {
  let observedState: Record<string, unknown> | null = null;
  const evaluate: Evaluate = async (state, questions): Promise<Record<string, unknown>> => {
    observedState = state;
    assert.deepEqual(Object.keys(questions), ["relevance"]);
    return { relevance: { type: "choice", choice: "no" } };
  };
  const result = await checkRelevance({
    item: { id: "eval", name: "A made-up answer" },
    category: { title: "Name a Pixar character", prompt: "Name a Pixar character" },
    model: "test",
    evaluate,
  });
  assert.deepEqual(observedState, {
    category: "Name a Pixar character",
    item: "A made-up answer",
  });
  assert.equal(result?.relevancy, false);
  assert.equal(result?.score, null);
});

test("eval runs three separate rarity scores after relevance", async (): Promise<void> => {
  const calls: string[] = [];
  const category = { title: "Name a Pixar character", prompt: "Name a Pixar character" };
  const evaluate: Evaluate = async (state, questions): Promise<Record<string, unknown>> => {
    if ("relevance" in questions) {
      assert.deepEqual(state, { category: category.prompt, item: "Woody" });
      calls.push("relevance");
      return { relevance: { type: "choice", choice: "no" } };
    }
    assert.deepEqual(state.category, category);
    calls.push("niche");
    const score = calls.filter((call: string): boolean => call === "niche").length;
    const probabilities = Object.fromEntries(Array.from({ length: 6 }, (_value: unknown, index: number): [string, number] => [String(index), index === score ? 1 : 0]));
    return { niche: { type: "score", score, probabilities } };
  };
  const result = await evaluateTrials({ item: { id: "eval", name: "Woody" }, category, model: "test", evaluate });
  assert.deepEqual(calls, ["relevance", "niche", "niche", "niche"]);
  assert.equal(result.relevance?.relevancy, false);
  assert.deepEqual(result.scores.map((entry: Judgment): number | null => entry.score), [0.2, 0.4, 0.6]);
});

test("game scoring waits for relevance and averages three runs", async (): Promise<void> => {
  const calls: string[] = [];
  let releaseProbe!: (value: Record<string, unknown>) => void;
  const probe = new Promise<Record<string, unknown>>((resolve): void => { releaseProbe = resolve; });
  const score = evaluator(calls);
  const evaluate: Evaluate = async (state, questions, model): Promise<Record<string, unknown>> => {
    if ("relevance" in questions) { calls.push("relevance"); return probe; }
    return score(state, questions, model);
  };
  const pending = judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, scoringRuns: 3, evaluate });
  assert.deepEqual(calls, ["relevance"]);
  releaseProbe({ relevance: { type: "choice", choice: "yes" } });
  assert.equal((await pending).score, 0.6);
  assert.deepEqual(calls, ["relevance", "niche", "niche", "niche"]);
});

test("single-score mode uses one rarity evaluation after relevance", async (): Promise<void> => {
  const calls: string[] = [];
  const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, scoringRuns: 1, evaluate: evaluator(calls) });
  assert.equal(result.score, 0.6);
  assert.deepEqual(calls, ["relevance", "niche"]);
});

test("jury averages score variance and stops after a failed run", async (): Promise<void> => {
  const item = { id: "languages:uiua", name: "Uiua" };
  let count = 0;
  const varied: Evaluate = async (): Promise<Record<string, unknown>> => {
    count += 1;
    const probabilities = Object.fromEntries(Array.from({ length: 6 }, (_value: unknown, index: number): [string, number] => [String(index), index === count ? 1 : 0]));
    return { niche: { type: "score", score: count, probabilities } };
  };
  const result = await scoreJury({ item, categoryId: "languages", model: "test", scoringRuns: 3, evaluate: varied });
  assert.ok(result.score !== null && Math.abs(result.score - 0.4) < 1e-12);
  assert.equal(count, 3);

  count = 0;
  const interrupted: Evaluate = async (): Promise<Record<string, unknown>> => {
    count += 1;
    if (count === 2) throw new GameError("JUDGE_UNAVAILABLE", "The second run failed.", 503);
    return { niche: { type: "score", score: 1, probabilities: { "0": 0, "1": 1, "2": 0, "3": 0, "4": 0, "5": 0 } } };
  };
  const failed = await scoreJury({ item, categoryId: "languages", model: "test", scoringRuns: 3, evaluate: interrupted });
  assert.equal(failed.status, "retryable_error");
  assert.equal(failed.score, null);
  assert.equal(count, 2);
  assert.equal(averageScores([result, failed, result]), null);
});

test("rejected and malformed probes cannot award fresh or cached points", async (): Promise<void> => {
  const caches: Record<string, number>[] = [{}, { "languages:nonsense": 1 }];
  for (const cachedScores of caches) {
    for (const choice of ["no", "maybe", undefined]) {
      const evaluate: Evaluate = async (state, questions, model): Promise<Record<string, unknown>> => {
        if ("relevance" in questions) return { relevance: { type: "choice", choice } };
        return evaluator([])(state, questions, model);
      };
      const result = await judgeAnswer({ answer: "nonsense", categoryId: "languages", model: "test", cachedScores, scoringRuns: 3, evaluate });
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
  const result = await judgeAnswer({ answer: "Uiua", categoryId: "languages", model: "test", cachedScores: {}, scoringRuns: 3, evaluate });
  assert.equal(result.status, "retryable_error");
  assert.equal(result.score, null);
  assert.equal(result.relevancy, null);
  assert.equal(result.message, "Probe unavailable");
});

test("normalized rarity scores are reused only within their category", async (): Promise<void> => {
  for (const categoryId of ["languages", "board-games"] as const) {
    const calls: string[] = [];
    const result = await judgeAnswer({ answer: "  GO  ", categoryId, model: "test", cachedScores: { "languages:go": 0.25 }, scoringRuns: 3, evaluate: evaluator(calls) });
    assert.deepEqual(calls, categoryId === "languages" ? ["relevance"] : ["relevance", "niche", "niche", "niche"]);
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
