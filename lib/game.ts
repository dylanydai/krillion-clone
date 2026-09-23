import { randomInt, randomUUID, createHash } from "node:crypto";
import { CATEGORIES, categoryById, normalizeName } from "./categories.ts";
import { GameError } from "./errors.ts";
import { failure } from "./judge.ts";
import { parseFishColor } from "./fish.ts";
import { METRES_PER_POINT } from "./dive.ts";
import type { Attempt, Judgment, Player, PublicPlayer, Room, RoomView, Round } from "./types.ts";

import { COUNTDOWN_SECONDS, ROUNDS_PER_GAME, ROUND_SECONDS } from "./game-config.ts";

export { ROUNDS_PER_GAME, ROUND_SECONDS } from "./game-config.ts";
export const JUDGE_LEASE_MS = 35_000;
export const JUDGING_GRACE_MS = 60_000;

export function sessionHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cleanName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 24 || /[\p{Cc}]/u.test(value)) {
    throw new GameError("INVALID_NAME", "Enter a name between 1 and 24 characters.");
  }
  return value.trim();
}

export function cleanAnswer(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new GameError("EMPTY_ANSWER", "Enter one item.");
  if (value.length > 120 || /[\p{Cc}]/u.test(value)) throw new GameError("ANSWER_TOO_LONG", "Enter one item name of up to 120 characters, on one line.");
  return value.trim();
}

export function cleanCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) throw new GameError("INVALID_CODE", "Enter the four-letter room code.");
  return code;
}

export function createRoom(name: string, token: string, model: string, now: number): Room {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const code = Array.from({ length: 4 }, (): string => alphabet[randomInt(alphabet.length)]).join("");
  const host: Player = { id: randomUUID(), sessionHash: sessionHash(token), name: cleanName(name), color: "#80DFEB" };
  return { code, version: 0, hostId: host.id, players: [host], phase: "lobby", roundIndex: -1, rounds: [], scores: {}, createdAt: now, model };
}

export function member(room: Room, token: string): Player {
  const player = room.players.find((entry: Player): boolean => entry.sessionHash === sessionHash(token));
  if (player === undefined) throw new GameError("NOT_JOINED", "Join this room to play.", 403);
  return player;
}

export function requireHost(room: Room, token: string): Player {
  const player = member(room, token);
  if (player.id !== room.hostId) throw new GameError("HOST_ONLY", "Only the host can do that.", 403);
  return player;
}

export function joinRoom(room: Room, token: string, name: string): void {
  if (room.players.some((player: Player): boolean => player.sessionHash === sessionHash(token))) return;
  if (room.phase !== "lobby") throw new GameError("GAME_STARTED", "This game has started. Join after the host opens a rematch.", 409);
  const cleaned = cleanName(name);
  if (room.players.some((player: Player): boolean => normalizeName(player.name) === normalizeName(cleaned))) throw new GameError("NAME_TAKEN", "That name is taken in this room. Choose another name.", 409);
  room.players.push({ id: randomUUID(), sessionHash: sessionHash(token), name: cleaned, color: "#F478A0" });
}

export function customizeFish(room: Room, token: string, color: unknown): void {
  const player = member(room, token);
  if (room.phase !== "lobby") throw new GameError("GAME_STARTED", "Change your fish colour in the lobby.", 409);
  player.color = parseFishColor(color);
}

export function currentRound(room: Room): Round {
  const round = room.rounds[room.roundIndex];
  if (round === undefined) throw new GameError("ROUND_CLOSED", "There is no active round.", 409);
  return round;
}

function openRound(room: Room, now: number): void {
  room.roundIndex += 1;
  const playedCategories = new Set(room.rounds.map((round: Round): string => round.categoryId));
  const availableCategories = CATEGORIES.filter((category): boolean => !playedCategories.has(category.id));
  if (availableCategories.length === 0) throw new Error("No unplayed categories remain.");
  const category = availableCategories[randomInt(availableCategories.length)];
  if (category === undefined) throw new Error("Cannot open a round without a category.");
  const startedAt = now + COUNTDOWN_SECONDS * 1000;
  room.rounds.push({ categoryId: category.id, startedAt, endsAt: startedAt + ROUND_SECONDS * 1000, answers: {} });
  room.phase = "playing";
}

export function startGame(room: Room, token: string, now: number): void {
  requireHost(room, token);
  if (room.phase !== "lobby") throw new GameError("GAME_STARTED", "The game has already started.", 409);
  openRound(room, now);
}

export function settleRound(room: Room, now: number): void {
  if (room.phase !== "playing" && room.phase !== "results") return;
  const round = currentRound(room);
  for (const attempt of Object.values(round.answers)) {
    if (attempt.status === "judging" && attempt.leaseUntil <= now) {
      attempt.status = "done";
      attempt.result = failure("JUDGE_UNAVAILABLE");
    }
  }
  if (room.phase !== "playing") return;
  const attempts = room.players.map((player: Player): Attempt | undefined => round.answers[player.id]);
  const finished = attempts.every((attempt: Attempt | undefined): boolean => attempt !== undefined && attempt.status === "done" && (attempt.skipped || attempt.result?.status === "scored"));
  if (finished) room.phase = "results";
  if (now < round.endsAt) return;
  const waiting = attempts.some((attempt: Attempt | undefined): boolean => attempt !== undefined && (attempt.status === "judging" || attempt.result?.status === "retryable_error"));
  if (!waiting || now >= round.endsAt + JUDGING_GRACE_MS) room.phase = "results";
}

export function nextRound(room: Room, token: string, now: number): void {
  requireHost(room, token);
  if (room.phase === "leaderboard") {
    openRound(room, now);
    return;
  }
  if (room.phase !== "results") throw new GameError("ROUND_OPEN", "Wait for the round results.", 409);
  if (Object.values(currentRound(room).answers).some((attempt: Attempt): boolean => attempt.status === "judging" && attempt.leaseUntil > now)) throw new GameError("JUDGING", "Wait for judging to finish.", 409);
  if (room.roundIndex === ROUNDS_PER_GAME - 1) room.phase = "finished";
  else room.phase = "leaderboard";
}

export function rematch(room: Room, token: string): void {
  requireHost(room, token);
  if (room.phase !== "finished") throw new GameError("GAME_OPEN", "Finish the game before starting a rematch.", 409);
  room.phase = "lobby";
  room.roundIndex = -1;
  room.rounds = [];
}

function ensureRound(room: Room, roundIndex: number): Round {
  if (room.roundIndex !== roundIndex || room.phase !== "playing") throw new GameError("ROUND_CLOSED", "This round is closed.", 409);
  return currentRound(room);
}

export function reserveAnswer(options: { room: Room; token: string; answer: string; roundIndex: number; now: number; retry: boolean }): { playerId: string; attempt: Attempt } {
  const { room, token, roundIndex, now, retry } = options;
  const player = member(room, token);
  const round = ensureRound(room, roundIndex);
  const previous = round.answers[player.id];
  if (previous?.status === "judging" && previous.leaseUntil > now) throw new GameError("JUDGING", "Your answer is already being judged.", 409);
  if (previous?.result?.status === "scored" || previous?.skipped) throw new GameError("ANSWER_LOCKED", "Your answer is already locked in.", 409);
  const count = previous === undefined ? 1 : previous.count + 1;
  let answer: string;
  let receivedAt: number;
  if (retry) {
    if (previous === undefined || (previous.result?.status !== "retryable_error" && previous.result?.errorCode !== "SCORE_UNCERTAIN")) throw new GameError("NO_RETRY", "There is no saved answer to retry.", 409);
    if (now >= round.endsAt + JUDGING_GRACE_MS) throw new GameError("ROUND_CLOSED", "The judging window has closed.", 409);
    answer = previous.answer;
    receivedAt = previous.receivedAt;
  } else {
    if (now < round.startedAt) throw new GameError("ROUND_NOT_STARTED", "The round has not started.", 409);
    if (now >= round.endsAt) throw new GameError("TIME_EXPIRED", "Time expired. Your answer was not submitted.", 409);
    answer = cleanAnswer(options.answer);
    receivedAt = now;
  }
  const attempt: Attempt = { id: randomUUID(), answer, receivedAt, leaseUntil: now + JUDGE_LEASE_MS, status: "judging", result: null, count, skipped: false };
  round.answers[player.id] = attempt;
  return { playerId: player.id, attempt };
}

export function finishAnswer(options: { room: Room; roundIndex: number; playerId: string; attemptId: string; judgment: Judgment; now: number }): void {
  const { room, roundIndex, playerId, attemptId, judgment, now } = options;
  const round = room.rounds[roundIndex];
  if (round === undefined) return;
  const attempt = round.answers[playerId];
  if (attempt === undefined || attempt.id !== attemptId || attempt.status !== "judging") return;
  if (room.phase === "playing" && now >= round.endsAt + JUDGING_GRACE_MS) {
    attempt.status = "done";
    attempt.result = failure("JUDGE_UNAVAILABLE");
    settleRound(room, now);
    return;
  }
  if (judgment.status === "scored") {
    if (judgment.canonicalId === null || judgment.score === null) throw new Error("An accepted score requires an item and a numeric score.");
    const key = judgment.canonicalId;
    if (room.scores[key] === undefined) room.scores[key] = judgment.score;
    judgment.score = room.scores[key];
  }
  attempt.result = judgment;
  attempt.status = "done";
  attempt.leaseUntil = 0;
  settleRound(room, now);
}

export function skipAnswer(room: Room, token: string, roundIndex: number, now: number): void {
  const player = member(room, token);
  const round = ensureRound(room, roundIndex);
  if (now < round.startedAt || now >= round.endsAt) throw new GameError("ROUND_CLOSED", "You can skip only while the round is open.", 409);
  const previous = round.answers[player.id];
  if (previous?.status === "judging" || previous?.result?.status === "scored") throw new GameError("ANSWER_LOCKED", "Your answer is already submitted.", 409);
  round.answers[player.id] = { id: randomUUID(), answer: "", receivedAt: now, leaseUntil: 0, status: "done", result: failure("SKIPPED", false), count: previous === undefined ? 1 : previous.count, skipped: true };
  settleRound(room, now);
}

export function publicRoom(room: Room, token: string, now: number): RoomView {
  const me = member(room, token);
  const revealed = room.phase === "results" || room.phase === "leaderboard" || room.phase === "finished";
  const round = room.roundIndex < 0 ? null : currentRound(room);
  const history = room.rounds.filter((_round: Round, index: number): boolean => index < room.roundIndex || revealed).map((entry: Round): RoomView["history"][number] => ({
    category: categoryById(entry.categoryId),
    results: room.players.map((player: Player): { playerId: string; attempt: Attempt | null } => ({ playerId: player.id, attempt: entry.answers[player.id] === undefined ? null : entry.answers[player.id] })),
  }));
  const players = room.players.map((player: Player): PublicPlayer => {
    const attempt = round === null ? undefined : round.answers[player.id];
    const points = history.reduce((sum: number, entry: RoomView["history"][number]): number => {
      const result = entry.results.find((value: { playerId: string; attempt: Attempt | null }): boolean => value.playerId === player.id);
      const score = result?.attempt?.result?.score;
      return sum + (score === null || score === undefined ? 0 : Math.round(score * 100));
    }, 0);
    const score = attempt?.result?.score;
    const roundPoints = score === null || score === undefined ? 0 : Math.round(score * 100);
    const previousDepth = (revealed ? points - roundPoints : points) * METRES_PER_POINT;
    return { id: player.id, name: player.name, color: player.color, points, previousDepth, depth: previousDepth + roundPoints * METRES_PER_POINT,
      state: attempt === undefined ? "thinking" : attempt.skipped ? "skipped" : attempt.status === "judging" ? "judging" : "answered",
      attempt: attempt === undefined || (!revealed && player.id !== me.id) ? null : attempt,
    };
  });
  return { code: room.code, version: room.version, hostId: room.hostId, me: me.id, phase: room.phase, roundIndex: room.roundIndex, totalRounds: ROUNDS_PER_GAME,
    category: round === null ? null : categoryById(round.categoryId), endsAt: round === null ? null : round.endsAt,
    startsAt: round === null ? null : round.startedAt, serverNow: now, players, history };
}
