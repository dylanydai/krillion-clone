import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMERA_FOLLOW_METRES, diveCameraDepth, VISIBLE_DIVE_METRES } from "../lib/dive.ts";

test("the camera stays at the surface until the fish reaches its following position", (): void => {
  assert.equal(diveCameraDepth(0), 0);
  assert.equal(diveCameraDepth(100), 0);
  assert.equal(diveCameraDepth(CAMERA_FOLLOW_METRES), 0);
});

test("the ocean pans continuously with the fish, retaining its visible position at any depth", (): void => {
  for (const depth of [181, 520, 1000, 2000]) {
    const camera = diveCameraDepth(depth);
    assert.equal(depth - camera, CAMERA_FOLLOW_METRES);
    assert.ok(depth - camera < VISIBLE_DIVE_METRES);
    assert.equal(diveCameraDepth(depth + 1) - camera, 1);
  }
});
