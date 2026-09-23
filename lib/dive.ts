import type { PublicPlayer, Room } from "./types.ts";

export const METRES_PER_POINT = 10;
export const VISIBLE_DIVE_METRES = 500;
export const CAMERA_FOLLOW_METRES = 180;

export function diveSceneKey(players: PublicPlayer[]): string {
  return JSON.stringify(players.map((player: PublicPlayer): { id: string; depth: number; previousDepth: number } => ({ id: player.id, depth: player.depth, previousDepth: player.previousDepth })));
}

export function diveCameraDepth(depth: number): number {
  return Math.max(0, depth - CAMERA_FOLLOW_METRES);
}

export type DiveProgress = { previousPoints: number; totalPoints: number; roundPoints: number };

export function diveProgress(player: PublicPlayer, phase: Room["phase"]): DiveProgress {
  const result = player.attempt?.result;
  const roundPoints = result?.status === "scored" && result.score !== null ? Math.round(result.score * 100) : 0;
  const revealed = phase === "results" || phase === "leaderboard" || phase === "finished";
  const previousPoints = revealed ? player.points - roundPoints : player.points;
  return { previousPoints, totalPoints: previousPoints + roundPoints, roundPoints };
}
