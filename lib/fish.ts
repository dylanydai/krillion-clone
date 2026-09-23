import { GameError } from "./errors.ts";

export type FishColor = `#${string}`;

export function isFishColor(value: unknown): value is FishColor {
  return typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
}

export function parseFishColor(value: unknown): FishColor {
  if (typeof value !== "string") throw new GameError("INVALID_COLOR", "Enter a hex colour such as #80DFEB.");
  const color = value.trim().toUpperCase();
  if (isFishColor(color)) return color;
  if (/^#[A-F\d]{3}$/.test(color)) return `#${[...color.slice(1)].map((digit: string): string => digit + digit).join("")}`;
  throw new GameError("INVALID_COLOR", "Enter a hex colour such as #80DFEB.");
}
