export class GameError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.status = status;
  }
}

export const MESSAGES: Record<string, string> = {
  JUDGING_EXPIRED: "Time ran out before judging finished. No depth earned.",
  INVALID_ITEM: "This answer is not a verified item for this category. Try another answer.",
  WRONG_CATEGORY: "This item does not fit this prompt. Try another answer.",
  UNVERIFIED_ITEM: "The judge could not confidently verify this answer. Try its established name or another answer.",
  AMBIGUOUS_ITEM: "This name has more than one possible match. Use the full name.",
  MULTIPLE_ITEMS: "Enter one item, not a list of answers.",
  INVALID_SUBMISSION: "Enter an item name. Instructions to the judge are not an answer.",
  UNSUPPORTED_VARIANT: "This modified name or variant does not fit this prompt.",
  JUDGE_UNAVAILABLE: "The judge is unavailable. Your answer is saved. Retry judging.",
  JUDGE_BILLING_REQUIRED: "Vercel requires a payment card before AI Gateway can judge answers. The host must enable AI Gateway billing. Your answer is saved.",
  SCORE_UNCERTAIN: "The item was accepted, but the judge could not determine its depth. Retry judging.",
  SKIPPED: "You skipped this round.",
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
