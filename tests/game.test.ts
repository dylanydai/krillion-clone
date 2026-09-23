import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCode, createRoom, currentRound, customizeFish, finishAnswer, joinRoom, member, nextRound, publicRoom, rematch, reserveAnswer, settleRound, skipAnswer, startGame, JUDGING_GRACE_MS, JUDGE_LEASE_MS } from "../lib/game.ts";
import { parseAction } from "../lib/service.ts";
import { diveProgress } from "../lib/dive.ts";
import { COUNTDOWN_SECONDS, ROUNDS_PER_GAME, ROUND_SECONDS } from "../lib/game-config.ts";
import { failure } from "../lib/judge.ts";
import type { Judgment, Room } from "../lib/types.ts";

const HOST = "host-secret";
const GUEST = "guest-secret";
const NOW = 100_000;

function setup(): Room {
  const room = createRoom("Host", HOST, "test", NOW - COUNTDOWN_SECONDS * 1000);
  joinRoom(room, GUEST, "Guest");
  startGame(room, HOST, NOW - COUNTDOWN_SECONDS * 1000);
  return room;
}

function judgment(score: number = 0.6): Judgment {
  return { status: "scored", relevancy: true, score, canonicalId: "languages:python", canonicalName: "Python", errorCode: null, message: null };
}

test("room codes contain exactly four uppercase letters", (): void => {
  const room = createRoom("Host", HOST, "test", NOW);
  assert.match(room.code, /^[A-Z]{4}$/);
  assert.equal(cleanCode(" abcd "), "ABCD");
  assert.equal(cleanCode(room.code), room.code);
  for (const invalid of ["ABC", "ABCDE", "ABC234", "AB12", "AB!D", "AB D", "ÁBCD"]) {
    assert.throws((): string => cleanCode(invalid), /four-letter room code/);
  }
});

test("lobbies accept more than eight players and still reject duplicate names", (): void => {
  const room = createRoom("Host", HOST, "test", NOW);
  for (let index = 1; index <= 12; index += 1) joinRoom(room, `guest-${index}`, `Guest ${index}`);
  assert.equal(room.players.length, 13);
  assert.equal(publicRoom(room, "guest-12", NOW).players.length, 13);
  assert.throws((): void => joinRoom(room, "duplicate", "Guest 1"), /name is taken/);
});

test("only the host can start, advance or rematch; outsiders cannot see the room", (): void => {
  const room = createRoom("Host", HOST, "test", NOW);
  joinRoom(room, GUEST, "Guest");
  assert.throws((): void => startGame(room, GUEST, NOW), /Only the host/);
  assert.throws((): RoomViewResult => publicRoom(room, "outsider", NOW), /Join this room/);
  startGame(room, HOST, NOW);
  assert.throws((): void => nextRound(room, GUEST, NOW), /Only the host/);
  assert.throws((): void => rematch(room, GUEST), /Only the host/);
});
type RoomViewResult = ReturnType<typeof publicRoom>;

test("countdown blocks early answers and preserves the full answer window", (): void => {
  const room = createRoom("Host", HOST, "test", NOW);
  joinRoom(room, GUEST, "Guest");
  startGame(room, HOST, NOW);
  const startedAt = NOW + COUNTDOWN_SECONDS * 1000;
  assert.equal(currentRound(room).startedAt, startedAt);
  assert.equal(currentRound(room).endsAt, startedAt + ROUND_SECONDS * 1000);
  assert.equal(publicRoom(room, GUEST, NOW).startsAt, startedAt);
  assert.throws(() => reserveAnswer({ room, token: GUEST, answer: "Python", roundIndex: 0, now: startedAt - 1, retry: false }), /not started/);
  assert.deepEqual(currentRound(room).answers, {});
  assert.equal(reserveAnswer({ room, token: GUEST, answer: "Python", roundIndex: 0, now: startedAt, retry: false }).attempt.receivedAt, startedAt);
  assert.throws(() => reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: currentRound(room).endsAt, retry: false }), /Time expired/);
  assert.throws(() => reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 1, now: NOW + 4000, retry: false }), /round is closed/);
});

test("live depths are shared while answers remain private until the reveal", (): void => {
  const room = setup();
  const reserved = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW + 4000, retry: false });
  finishAnswer({ room, roundIndex: 0, playerId: reserved.playerId, attemptId: reserved.attempt.id, judgment: judgment(), now: NOW + 5000 });
  const view = publicRoom(room, GUEST, NOW + 5000);
  assert.equal(view.players[0].attempt, null);
  assert.equal(view.players[0].points, 0);
  assert.equal(view.players[0].depth, 600);
  assert.equal(view.players[0].previousDepth, 0);
  assert.deepEqual(view.history, []);
  assert.ok(!JSON.stringify(view).includes("Python"));
  assert.ok(!JSON.stringify(view).includes("sessionHash"));
  assert.deepEqual(diveProgress(publicRoom(room, HOST, NOW + 5000).players[0], "playing"), { previousPoints: 0, totalPoints: 60, roundPoints: 60 });
  skipAnswer(room, GUEST, 0, NOW + 5000);
  assert.equal(room.phase, "results");
  assert.equal(publicRoom(room, GUEST, NOW + 5000).players[0].points, 60);
  assert.equal(publicRoom(room, GUEST, NOW + 5000).players[0].depth, 600);
  assert.deepEqual(diveProgress(publicRoom(room, HOST, NOW + 5000).players[0], "results"), { previousPoints: 0, totalPoints: 60, roundPoints: 60 });
});

test("fish colours are validated, owned by each player, and shared with the room", (): void => {
  const room = createRoom("Host", HOST, "test", NOW);
  joinRoom(room, GUEST, "Guest");
  customizeFish(room, GUEST, "#a23bc4");
  assert.equal(member(room, GUEST).color, "#A23BC4");
  assert.equal(member(room, HOST).color, "#80DFEB");
  assert.equal(publicRoom(room, HOST, NOW).players[1].color, "#A23BC4");
  assert.throws((): void => customizeFish(room, "outsider", "#FFDD00"), /Join this room/);
  for (const color of ["constructor", "invalid", "#ff", "#abcd", "#12345678", "#GG0000", "red;display:none", null]) {
    assert.throws((): void => customizeFish(room, GUEST, color), /hex colour/);
    assert.throws((): ReturnType<typeof parseAction> => parseAction({ action: "customize", color }), /hex colour/);
  }
  assert.deepEqual(parseAction({ action: "customize", color: " #abc ", playerId: room.hostId }), { action: "customize", color: "#AABBCC" });
  for (const color of ["#000000", "#FFFFFF"]) {
    assert.deepEqual(parseAction({ action: "customize", color }), { action: "customize", color });
  }
  startGame(room, HOST, NOW);
  assert.throws((): void => customizeFish(room, GUEST, "#FFDD00"), /in the lobby/);
  for (let index = 0; index < ROUNDS_PER_GAME; index += 1) {
    const time = currentRound(room).startedAt;
    skipAnswer(room, HOST, index, time);
    skipAnswer(room, GUEST, index, time);
    nextRound(room, HOST, time);
    if (index < ROUNDS_PER_GAME - 1) nextRound(room, HOST, time);
  }
  rematch(room, HOST);
  assert.equal(member(room, GUEST).color, "#A23BC4");
  assert.equal(publicRoom(room, GUEST, NOW).players[1].depth, 0);
});

test("retries keep receipt time and accepted answers cannot be replaced", (): void => {
  const room = setup();
  const reserved = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW + 4000, retry: false });
  assert.throws(() => reserveAnswer({ room, token: HOST, answer: "Java", roundIndex: 0, now: NOW + 5000, retry: false }), /already being judged/);
  finishAnswer({ room, roundIndex: 0, playerId: reserved.playerId, attemptId: reserved.attempt.id, judgment: failure("JUDGE_UNAVAILABLE"), now: NOW + 6000 });
  const retry = reserveAnswer({ room, token: HOST, answer: "Java", roundIndex: 0, now: currentRound(room).endsAt + 1000, retry: true });
  assert.equal(retry.attempt.answer, "Python");
  assert.equal(retry.attempt.receivedAt, NOW + 4000);
  finishAnswer({ room, roundIndex: 0, playerId: retry.playerId, attemptId: reserved.attempt.id, judgment: judgment(1), now: NOW + 7000 });
  assert.equal(currentRound(room).answers[retry.playerId].result, null);
  finishAnswer({ room, roundIndex: 0, playerId: retry.playerId, attemptId: retry.attempt.id, judgment: judgment(), now: NOW + 8000 });
  assert.throws(() => reserveAnswer({ room, token: HOST, answer: "Java", roundIndex: 0, now: NOW + 9000, retry: false }), /locked in/);
});

test("same item receives one score even if concurrent judges disagree", (): void => {
  const room = setup();
  const host = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW + 4000, retry: false });
  const guest = reserveAnswer({ room, token: GUEST, answer: "Python 3", roundIndex: 0, now: NOW + 4000, retry: false });
  finishAnswer({ room, roundIndex: 0, playerId: host.playerId, attemptId: host.attempt.id, judgment: judgment(0.2), now: NOW + 5000 });
  finishAnswer({ room, roundIndex: 0, playerId: guest.playerId, attemptId: guest.attempt.id, judgment: judgment(0.4), now: NOW + 5000 });
  const view = publicRoom(room, HOST, NOW + 5000);
  assert.deepEqual(view.players.map((player): number => player.points), [20, 20]);
});

test("an answer received just before the deadline can finish judging afterward", (): void => {
  const room = setup();
  const deadline = currentRound(room).endsAt;
  const reserved = reserveAnswer({ room, token: HOST, answer: "Uiua", roundIndex: 0, now: deadline - 1, retry: false });
  settleRound(room, deadline + 1000);
  assert.equal(room.phase, "playing");
  assert.equal(currentRound(room).answers[reserved.playerId].status, "judging");
  finishAnswer({ room, roundIndex: 0, playerId: reserved.playerId, attemptId: reserved.attempt.id, judgment: judgment(), now: deadline + 10_000 });
  assert.equal(currentRound(room).answers[reserved.playerId].receivedAt, deadline - 1);
  assert.equal(currentRound(room).answers[reserved.playerId].result?.status, "scored");
});

test("submissions and saved-answer retries continue past five attempts", (): void => {
  const room = setup();
  for (let index = 0; index < 12; index += 1) {
    const attempt = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW + index * 100, retry: false });
    finishAnswer({ room, roundIndex: 0, playerId: attempt.playerId, attemptId: attempt.attempt.id, judgment: failure("JUDGE_UNAVAILABLE"), now: NOW + index * 100 + 1 });
    assert.equal(attempt.attempt.count, index + 1);
  }
  for (let index = 0; index < 8; index += 1) {
    const retry = reserveAnswer({ room, token: HOST, answer: "", roundIndex: 0, now: NOW + 2000 + index * 100, retry: true });
    assert.equal(retry.attempt.answer, "Python");
    assert.equal(retry.attempt.receivedAt, NOW + 1100);
    finishAnswer({ room, roundIndex: 0, playerId: retry.playerId, attemptId: retry.attempt.id, judgment: failure("JUDGE_UNAVAILABLE"), now: NOW + 2000 + index * 100 + 1 });
    assert.equal(retry.attempt.count, index + 13);
  }
});

test("missing players and crashed requests cannot block a round forever", (): void => {
  const room = setup();
  const reserved = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW + 4000, retry: false });
  settleRound(room, NOW + 4000 + JUDGE_LEASE_MS);
  assert.equal(currentRound(room).answers[reserved.playerId].result?.status, "retryable_error");
  assert.equal(room.phase, "playing");
  settleRound(room, currentRound(room).endsAt + JUDGING_GRACE_MS);
  assert.equal(room.phase, "results");
  assert.equal(publicRoom(room, HOST, NOW).players[0].points, 0);
});

test("each round shows results before the shared leaderboard and rematch retains members", (): void => {
  const room = setup();
  const first = reserveAnswer({ room, token: HOST, answer: "Python", roundIndex: 0, now: NOW, retry: false });
  finishAnswer({ room, roundIndex: 0, playerId: first.playerId, attemptId: first.attempt.id, judgment: judgment(0.4), now: NOW + 1000 });
  skipAnswer(room, GUEST, 0, NOW + 4000);
  assert.equal(room.phase, "results");
  nextRound(room, HOST, NOW + 5000);
  assert.equal(room.phase, "leaderboard");
  assert.equal(room.roundIndex, 0);
  const guestView = publicRoom(room, GUEST, NOW + 5000);
  assert.equal(guestView.phase, "leaderboard");
  assert.equal(guestView.players[0].points, 40);
  assert.equal(guestView.players[0].attempt?.answer, "Python");
  assert.throws((): void => nextRound(room, GUEST, NOW + 5000), /Only the host/);
  assert.throws(() => reserveAnswer({ room, token: GUEST, answer: "Java", roundIndex: 0, now: NOW + 5000, retry: false }), /round is closed/);
  nextRound(room, HOST, NOW + 6000);
  assert.notEqual(currentRound(room).categoryId, room.rounds[0].categoryId);
  assert.equal(currentRound(room).startedAt, NOW + 9000);
  assert.deepEqual(diveProgress(publicRoom(room, HOST, NOW + 6000).players[0], "playing"), { previousPoints: 40, totalPoints: 40, roundPoints: 0 });
  const second = reserveAnswer({ room, token: HOST, answer: "Jane Street", roundIndex: 1, now: NOW + 9000, retry: false });
  finishAnswer({ room, roundIndex: 1, playerId: second.playerId, attemptId: second.attempt.id, judgment: { ...judgment(0.2), canonicalId: "firms:jane-street", canonicalName: "Jane Street" }, now: NOW + 9000 });
  skipAnswer(room, GUEST, 1, NOW + 9000);
  assert.equal(room.phase, "results");
  const roundResults = publicRoom(room, HOST, NOW + 9000);
  assert.equal(roundResults.players[0].attempt?.result?.score, 0.2);
  assert.equal(roundResults.players[0].points, 60);
  assert.equal(roundResults.players[0].depth, 600);
  assert.equal(roundResults.players[0].previousDepth, 400);
  assert.deepEqual(diveProgress(roundResults.players[0], "results"), { previousPoints: 40, totalPoints: 60, roundPoints: 20 });
  nextRound(room, HOST, NOW + 10000);
  assert.equal(room.phase, "leaderboard");
  for (let index = 2; index < ROUNDS_PER_GAME; index += 1) {
    const openedAt = currentRound(room).endsAt;
    nextRound(room, HOST, openedAt);
    assert.equal(room.roundIndex, index);
    assert.equal(currentRound(room).startedAt, openedAt + COUNTDOWN_SECONDS * 1000);
    assert.throws(() => reserveAnswer({ room, token: HOST, answer: "Early", roundIndex: index, now: openedAt, retry: false }), /not started/);
    settleRound(room, currentRound(room).endsAt);
    assert.equal(room.phase, "results");
    nextRound(room, HOST, currentRound(room).endsAt);
    assert.equal(room.phase, index === ROUNDS_PER_GAME - 1 ? "finished" : "leaderboard");
  }
  assert.equal(room.rounds.length, 7);
  assert.equal(new Set(room.rounds.map((round): string => round.categoryId)).size, 7);
  assert.equal(publicRoom(room, HOST, NOW).totalRounds, 7);
  assert.equal(room.phase, "finished");
  assert.equal(publicRoom(room, GUEST, NOW + 10000).players[0].points, 60);
  rematch(room, HOST);
  assert.equal(room.phase, "lobby");
  assert.deepEqual(room.rounds, []);
  assert.equal(room.players.length, 2);
  assert.equal(member(room, GUEST).name, "Guest");
  assert.deepEqual(diveProgress(publicRoom(room, HOST, NOW + 11000).players[0], "lobby"), { previousPoints: 0, totalPoints: 0, roundPoints: 0 });
});

test("unverified answers remain unscored without blocking round advancement", (): void => {
  const room = setup();
  const reserved = reserveAnswer({ room, token: GUEST, answer: "Chinese Python", roundIndex: 0, now: NOW + 4000, retry: false });
  finishAnswer({ room, roundIndex: 0, playerId: reserved.playerId, attemptId: reserved.attempt.id, judgment: failure("UNVERIFIED_ITEM"), now: NOW + 5000 });
  settleRound(room, currentRound(room).endsAt);
  assert.equal(room.phase, "results");
  assert.equal(currentRound(room).answers[reserved.playerId].result?.score, null);
  assert.deepEqual(diveProgress(publicRoom(room, GUEST, NOW + 30000).players[1], "results"), { previousPoints: 0, totalPoints: 0, roundPoints: 0 });
  nextRound(room, HOST, NOW + 30000);
  assert.equal(room.phase, "leaderboard");
  nextRound(room, HOST, NOW + 31000);
  assert.equal(room.roundIndex, 1);
});

test("removed host review actions are rejected by the API parser", (): void => {
  for (const action of ["request_review", "review"]) {
    assert.throws((): ReturnType<typeof parseAction> => parseAction({ action, roundIndex: 0, playerId: "guest", accept: true }), /action or its fields are invalid/);
  }
});

test("the API accepts all seven round indices and rejects rounds outside the game", (): void => {
  for (let roundIndex = 0; roundIndex < 7; roundIndex += 1) {
    const action = { action: "answer", answer: "Example", roundIndex };
    assert.deepEqual(parseAction(action), action);
  }
  for (const roundIndex of [-1, 7, 1.5]) {
    assert.throws(() => parseAction({ action: "answer", answer: "Example", roundIndex }), /valid round number/);
  }
});
