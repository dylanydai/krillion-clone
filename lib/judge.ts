import { categoryById, normalizeName } from "./categories.ts";
import { GameError, MESSAGES } from "./errors.ts";
import { verifyAnswer, type Verify } from "./verify.ts";
import type { CategoryId, Judgment } from "./types.ts";

type AcceptedAnswer = { id: string; name: string };

type Question = { type: "choice" | "score"; instructions: string; criteria: Record<string, string> | string[] };
export type Evaluate = (state: Record<string, unknown>, questions: Record<string, Question>, model: string) => Promise<Record<string, unknown>>;

const SERVICE_ERRORS = new Set(["JUDGE_UNAVAILABLE", "JUDGE_BILLING_REQUIRED"]);
const LEVELS: string[] = [
  "An immediate default that this audience readily recalls for the category.",
  "A familiar alternative or a popular clever pick that many players know.",
  "A recognizable item that takes deliberate searching of memory.",
  "An uncommon item that usually requires a particular interest or experience.",
  "A deep cut that even interested players seldom recall without specialist knowledge.",
  "An exceptional deep cut that even knowledgeable enthusiasts seldom recall within the time limit.",
];

export function objectValue(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GameError("JUDGE_UNAVAILABLE", `Invalid ${context} received from the judge.`, 502);
  }
  return value as Record<string, unknown>;
}

function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new GameError("JUDGE_UNAVAILABLE", "The judge returned an invalid probability.", 502);
  }
  return value;
}

export const evaluateJev: Evaluate = async (state: Record<string, unknown>, questions: Record<string, Question>, model: string): Promise<Record<string, unknown>> => {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new GameError("JUDGE_UNAVAILABLE", "Set AI_GATEWAY_API_KEY on the server before starting a game.", 503);
  let response: Response;
  try {
    response = await fetch("https://ai-gateway.vercel.sh/v1/evaluate", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state, questions }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch (error: unknown) {
    throw new GameError("JUDGE_UNAVAILABLE", error instanceof Error && error.name === "TimeoutError" ? "The judge timed out. Retry judging." : "Could not connect to the judge. Retry judging.", 503);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new GameError("JUDGE_UNAVAILABLE", `The judge returned invalid JSON (HTTP ${response.status}). Retry judging.`, 502);
  }
  if (!response.ok) {
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "object" && payload.error !== null && "type" in payload.error && payload.error.type === "customer_verification_required") {
      throw new GameError("JUDGE_BILLING_REQUIRED", MESSAGES.JUDGE_BILLING_REQUIRED, 503);
    }
    throw new GameError("JUDGE_UNAVAILABLE", `The judge returned HTTP ${response.status}. Your answer is saved. Retry judging.`, 502);
  }
  return objectValue(objectValue(payload, "response").answers, "answers");
};

export function failure(code: string, relevancy: boolean | null = null, item: AcceptedAnswer | null = null): Judgment {
  const message = MESSAGES[code];
  if (message === undefined) throw new Error(`Unknown judgment error: ${code}`);
  return {
    status: SERVICE_ERRORS.has(code) ? "retryable_error" : relevancy === false ? "rejected" : "unverified",
    relevancy, score: null, canonicalId: item === null ? null : item.id,
    canonicalName: item === null ? null : item.name, errorCode: code, message,
  };
}

export async function scoreItem(options: { item: AcceptedAnswer; categoryId: CategoryId; model: string; evaluate?: Evaluate }): Promise<Judgment> {
  const { item, categoryId, model, evaluate = evaluateJev } = options;
  try {
    const answers = await evaluate({
      category: categoryById(categoryId),
      accepted_item: { name: item.name },
      audience: "English-speaking friends interested in programming and quantitative finance, who can name items in this category.",
      time_limit_seconds: 25,
    }, {
      niche: { type: "score", instructions: "Rate how unlikely this audience is to recall the accepted item for this category within the time limit while trying to be uncommon. Compare eligible items in this category. Judge the item itself. Do not reward alternate names or extra words. A popular clever answer remains common. Do not infer rarity from the fact that the whole category is specialized.", criteria: LEVELS },
    }, model);
    const answer = objectValue(answers.niche, "score");
    const raw = answer.score;
    if (answer.type !== "score" || typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > LEVELS.length - 1) {
      throw new GameError("JUDGE_UNAVAILABLE", "The judge returned an invalid score.", 502);
    }
    const probabilities = objectValue(answer.probabilities, "score probabilities");
    const weights = LEVELS.map((_level: string, index: number): number => probability(probabilities[String(index)]));
    if (Math.abs(weights.reduce((sum: number, weight: number): number => sum + weight, 0) - 1) > 0.02) {
      throw new GameError("JUDGE_UNAVAILABLE", "The judge returned an invalid score distribution.", 502);
    }
    const mean = weights.reduce((sum: number, weight: number, index: number): number => sum + weight * index, 0);
    if (Math.abs(mean - raw) > 0.05) throw new GameError("JUDGE_UNAVAILABLE", "The judge score does not match its distribution.", 502);
    const variance = weights.reduce((sum: number, weight: number, index: number): number => sum + weight * (index - raw) ** 2, 0);
    if (variance > 2.25) return failure("SCORE_UNCERTAIN", true, item);
    return { status: "scored", relevancy: true, score: raw / (LEVELS.length - 1), canonicalId: item.id, canonicalName: item.name, errorCode: null, message: null };
  } catch (error: unknown) {
    if (!(error instanceof GameError) || !SERVICE_ERRORS.has(error.code)) throw error;
    return { ...failure(error.code, true, item), message: error.message };
  }
}

export async function judgeAnswer(options: { answer: string; categoryId: CategoryId; model: string; cachedScores: Record<string, number>; evaluate?: Evaluate; verify?: Verify }): Promise<Judgment> {
  const { answer, categoryId, model, cachedScores, evaluate = evaluateJev, verify = verifyAnswer } = options;
  try {
    if (!await verify({ answer, category: categoryById(categoryId) })) return failure("INVALID_ITEM", false);
  } catch (error: unknown) {
    if (!(error instanceof GameError) || !SERVICE_ERRORS.has(error.code)) throw error;
    return { ...failure(error.code), message: error.message };
  }
  const item: AcceptedAnswer = { id: `${categoryId}:${normalizeName(answer)}`, name: answer.normalize("NFKC").trim().replace(/\s+/g, " ") };
  const cached = cachedScores[item.id];
  if (cached !== undefined) return { status: "scored", relevancy: true, score: cached, canonicalId: item.id, canonicalName: item.name, errorCode: null, message: null };
  return scoreItem({ item, categoryId, model, evaluate });
}
