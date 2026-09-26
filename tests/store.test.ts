import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, updateRoom } from "../lib/store.ts";
import { createRoom, joinRoom, setScoringRuns, startGame } from "../lib/game.ts";
import { submitAnswer } from "../lib/service.ts";
import type { Judge } from "../lib/service.ts";
import type { Judgment, Room } from "../lib/types.ts";

test("simultaneous updates retain every player's change", async (): Promise<void> => {
  const store = memoryStore();
  const room = createRoom("Host", "host", "test", Date.now());
  await store.create(room);
  await Promise.all(Array.from({ length: 7 }, (_value: unknown, index: number) => updateRoom(store, room.code, (value: Room): void => joinRoom(value, `guest-${index}`, `Guest ${index}`))));
  assert.equal((await store.read(room.code))?.players.length, 8);
});

test("an outdated version cannot replace newer room state", async (): Promise<void> => {
  const store = memoryStore();
  const room = createRoom("Host", "host", "test", Date.now());
  assert.equal(await store.create(room), true);
  assert.equal(await store.create(room), false);
  await updateRoom(store, room.code, (value: Room): void => joinRoom(value, "guest", "Guest"));
  assert.equal(await store.replace(room, 0), false);
});

test("duplicate simultaneous answer requests invoke the judge only once", async (): Promise<void> => {
  const store = memoryStore();
  const room = createRoom("Host", "host", "test", Date.now());
  setScoringRuns(room, "host", 1);
  startGame(room, "host", Date.now() - 4000);
  await store.create(room);
  let calls = 0;
  const judge: Judge = async (options): Promise<Judgment> => {
    assert.equal(options.scoringRuns, 1);
    calls += 1;
    await new Promise<void>((resolve): void => { setTimeout(resolve, 20); });
    return { status: "scored", relevancy: true, score: 0.2, canonicalId: "languages:python", canonicalName: "Python", errorCode: null, message: null };
  };
  const outcomes = await Promise.allSettled([1, 2].map(() => submitAnswer({ store, code: room.code, token: "host", action: { action: "answer", answer: "Python", roundIndex: 0 }, judge })));
  assert.equal(calls, 1);
  assert.equal(outcomes.filter((outcome): boolean => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome): boolean => outcome.status === "rejected").length, 1);
});
