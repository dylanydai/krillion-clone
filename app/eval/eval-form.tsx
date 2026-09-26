"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Category } from "../../lib/types";

type EvalScore = { run: number; score: number | null; message: string | null };
type EvalResult = { question: string; answer: string; relevant: boolean | null; message: string | null; scores: EvalScore[]; juryScore: number | null };

function parseEvalResult(value: unknown): EvalResult {
  if (typeof value !== "object" || value === null || !("question" in value) || typeof value.question !== "string" || !("answer" in value) || typeof value.answer !== "string" || !("relevant" in value) || (value.relevant !== null && typeof value.relevant !== "boolean") || !("message" in value) || (value.message !== null && typeof value.message !== "string") || !("scores" in value) || !Array.isArray(value.scores) || value.scores.length !== 3 || !("juryScore" in value) || (value.juryScore !== null && (typeof value.juryScore !== "number" || !Number.isFinite(value.juryScore) || value.juryScore < 0 || value.juryScore > 1))) {
    throw new Error("The eval server returned an invalid result.");
  }
  const validScores = value.scores.every((score: unknown, index: number): boolean => typeof score === "object" && score !== null && "run" in score && score.run === index + 1 && "score" in score && (score.score === null || (typeof score.score === "number" && Number.isFinite(score.score) && score.score >= 0 && score.score <= 1)) && "message" in score && (score.message === null || typeof score.message === "string") && (score.score !== null || typeof score.message === "string"));
  if (!validScores) throw new Error("The eval server returned an invalid score.");
  return value as EvalResult;
}

export default function EvalForm({ categories }: { categories: Category[] }): ReactNode {
  const [search, setSearch] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matches = categories.filter((category: Category): boolean => `${category.title} ${category.prompt}`.toLocaleLowerCase("en-US").includes(search.toLocaleLowerCase("en-US").trim()));

  async function evaluate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedId === null ? { question, answer } : { categoryId: selectedId, answer }),
      });
      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null) throw new Error("The eval server returned an invalid response.");
      if (!response.ok) {
        if (!("error" in payload) || typeof payload.error !== "object" || payload.error === null || !("message" in payload.error) || typeof payload.error.message !== "string") throw new Error(`Eval failed (HTTP ${response.status}).`);
        throw new Error(payload.error.message);
      }
      setResult(parseEvalResult(payload));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not run the eval.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel eval-panel">
    <a href="/">← Game</a>
    <h1>Jev eval</h1>
    <p className="muted">Search a game question or enter your own, then check one answer for relevance and score its rarity three separate times.</p>
    <form onSubmit={evaluate}>
      <label htmlFor="question-search">Search game questions</label>
      <input id="question-search" value={search} onChange={(event): void => setSearch(event.target.value)} placeholder="Search by topic or wording" />
      <div className="eval-question-list" aria-label="Matching game questions">
        {matches.map((category: Category): ReactNode => <button key={category.id} type="button" className={selectedId === category.id ? "selected" : "secondary"} aria-pressed={selectedId === category.id} onClick={(): void => { setSelectedId(category.id); setResult(null); }}>{category.prompt}</button>)}
        {matches.length === 0 && <span className="muted">No matching game questions. Enter a custom question below.</span>}
      </div>
      <label htmlFor="custom-question">Or use a custom question</label>
      <input id="custom-question" value={question} onChange={(event): void => { setQuestion(event.target.value); setSelectedId(null); setResult(null); }} maxLength={200} placeholder="Name a Pixar character" />
      {selectedId !== null && <p className="muted eval-selection">Selected: {categories.find((category: Category): boolean => category.id === selectedId)?.prompt}</p>}
      <label htmlFor="eval-answer">Answer</label>
      <input id="eval-answer" value={answer} onChange={(event): void => setAnswer(event.target.value)} maxLength={120} required placeholder="Enter one answer" />
      <button type="submit" disabled={busy || (selectedId === null && question.trim().length === 0)}>{busy ? "Checking…" : "Run eval"}</button>
    </form>
    {error !== null && <p className="error" role="alert">{error}</p>}
    {result !== null && <div className="notice" role="status">
      <h2>{result.relevant === true ? "Relevant" : result.relevant === false ? "Not relevant" : "Could not verify"}</h2>
      <p>{result.question} → {result.answer}</p>
      {result.message !== null && <p>{result.message}</p>}
      <h3>Rarity scores</h3>
      <ol className="eval-scores">{result.scores.map((entry: EvalScore): ReactNode => <li key={entry.run}><strong>Run {entry.run}</strong><span>{entry.score === null ? entry.message : `${(entry.score * 5).toFixed(2)} / 5 · ${Math.round(entry.score * 100) * 10} m`}</span></li>)}</ol>
      <p className="eval-average"><strong>Jury average</strong> {result.juryScore === null ? "Unavailable until all three runs return scores" : `${(result.juryScore * 5).toFixed(2)} / 5 · ${Math.round(result.juryScore * 100) * 10} m`}</p>
      {result.relevant !== true && <p>These scores are diagnostic. The game would award no depth for this answer.</p>}
    </div>}
  </section>;
}
