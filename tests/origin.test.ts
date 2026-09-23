import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOrigin } from "../lib/origin.ts";
import { GameError } from "../lib/errors.ts";

test("browser requests use the public Host even when Next.js uses localhost internally", (): void => {
  const request = new Request("http://localhost:3000/api/rooms", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  });
  assert.doesNotThrow((): void => validateOrigin(request));
});

test("same-origin HTTPS requests support a public deployment hostname", (): void => {
  const request = new Request("https://internal.vercel.app/api/rooms", {
    method: "POST",
    headers: { host: "game.example.com", origin: "https://game.example.com" },
  });
  assert.doesNotThrow((): void => validateOrigin(request));
});

test("another website, port, protocol or missing host cannot pass the origin check", (): void => {
  const cases: Record<string, string>[] = [
    { host: "127.0.0.1:3000", origin: "http://other.example" },
    { host: "127.0.0.1:3000", origin: "http://127.0.0.1:4000" },
    { host: "127.0.0.1:3000", origin: "https://127.0.0.1:3000" },
    { host: "127.0.0.1:3000", origin: "null" },
    { origin: "http://127.0.0.1:3000" },
  ];
  for (const headers of cases) {
    const request = new Request("http://localhost:3000/api/rooms", { method: "POST", headers });
    assert.throws((): void => validateOrigin(request), (error: unknown): boolean => error instanceof GameError && error.code === "INVALID_ORIGIN");
  }
});
