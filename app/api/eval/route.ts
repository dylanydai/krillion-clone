import { CATEGORIES } from "../../../lib/categories";
import { GameError } from "../../../lib/errors";
import { cleanAnswer } from "../../../lib/game";
import { apiError, body } from "../../../lib/http";
import { averageScores, evaluateTrials } from "../../../lib/judge";
import type { Category, Judgment } from "../../../lib/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (process.env.EVAL_MODE !== "1") return new Response(null, { status: 404 });
  try {
    const input = await body(request);
    if (typeof input !== "object" || input === null || !("answer" in input)) {
      throw new GameError("INVALID_REQUEST", "Enter a question and an answer.");
    }
    const answer = cleanAnswer(input.answer);
    let category: Pick<Category, "title" | "prompt">;
    if ("categoryId" in input && typeof input.categoryId === "string") {
      const match = CATEGORIES.find((entry: Category): boolean => entry.id === input.categoryId);
      if (match === undefined) throw new GameError("INVALID_REQUEST", "Select a listed question.");
      category = match;
    } else if ("question" in input && typeof input.question === "string") {
      const question = input.question.trim();
      if (question.length === 0 || question.length > 200 || /[\p{Cc}]/u.test(question)) {
        throw new GameError("INVALID_REQUEST", "Enter a question of up to 200 characters, on one line.");
      }
      category = { title: question, prompt: question };
    } else {
      throw new GameError("INVALID_REQUEST", "Select a listed question or enter a custom question.");
    }
    const model = process.env.JEV_MODEL === undefined ? "typesafe-ai/jev" : process.env.JEV_MODEL;
    const result = await evaluateTrials({ item: { id: "eval", name: answer }, category, model });
    return Response.json({
      question: category.prompt,
      answer,
      relevant: result.relevance === null ? true : result.relevance.relevancy,
      message: result.relevance?.message ?? null,
      scores: result.scores.map((judgment: Judgment, index: number): { run: number; score: number | null; message: string | null } => ({ run: index + 1, score: judgment.score, message: judgment.message })),
      juryScore: averageScores(result.scores),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return apiError(error);
  }
}
