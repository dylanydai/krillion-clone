import type { FishColor } from "./fish.ts";

import type { ArchiveCategoryId } from "./archive-categories.ts";
import type { AdditionalCategoryId } from "./prompt-pack.ts";

export type CategoryId = "languages" | "firms" | AdditionalCategoryId | ArchiveCategoryId;
export type ScoringRuns = 1 | 3;

export type Category = {
  id: CategoryId;
  title: string;
  prompt: string;
};

export type Judgment = {
  status: "scored" | "rejected" | "unverified" | "retryable_error";
  relevancy: boolean | null;
  score: number | null;
  canonicalId: string | null;
  canonicalName: string | null;
  errorCode: string | null;
  message: string | null;
};

export type Attempt = {
  id: string;
  answer: string;
  receivedAt: number;
  leaseUntil: number;
  status: "judging" | "done";
  result: Judgment | null;
  count: number;
  skipped: boolean;
};

export type Player = { id: string; sessionHash: string; name: string; color: FishColor };
export type Round = {
  categoryId: CategoryId;
  startedAt: number;
  endsAt: number;
  answers: Record<string, Attempt>;
};

export type Room = {
  girlfriendFriendly: boolean;
  scoringRuns: ScoringRuns;
  code: string;
  version: number;
  hostId: string;
  players: Player[];
  phase: "lobby" | "playing" | "results" | "leaderboard" | "finished";
  roundIndex: number;
  rounds: Round[];
  scores: Record<string, number>;
  createdAt: number;
  model: string;
};

export type PublicPlayer = {
  id: string;
  name: string;
  color: FishColor;
  depth: number;
  previousDepth: number;
  points: number;
  state: "thinking" | "judging" | "answered" | "skipped";
  attempt: Attempt | null;
};

export type RoomView = {
  girlfriendFriendly: boolean;
  scoringRuns: ScoringRuns;
  code: string;
  version: number;
  hostId: string;
  me: string;
  phase: Room["phase"];
  roundIndex: number;
  totalRounds: number;
  category: Category | null;
  endsAt: number | null;
  startsAt: number | null;
  serverNow: number;
  players: PublicPlayer[];
  history: { category: Category; results: { playerId: string; attempt: Attempt | null }[] }[];
};
