"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { diveCameraDepth, METRES_PER_POINT, VISIBLE_DIVE_METRES } from "../../../lib/dive";
import type { PublicPlayer } from "../../../lib/types";
import FishSprite from "../../fish-sprite";
import OceanScene, { worldPosition } from "../../ocean-scene";

const DESCENT_MS = 2800;
const ARRIVAL_PAUSE_MS = 450;

type DiverTarget = { id: string; depth: number; previousDepth: number };

function initialDepths(sceneKey: string): Record<string, number> {
  const targets: DiverTarget[] = JSON.parse(sceneKey);
  return Object.fromEntries(targets.map((target: DiverTarget): [string, number] => [target.id, target.previousDepth]));
}

function useAnimatedDepths(sceneKey: string, onArrive: (key: string) => void): Record<string, number> {
  const [depths, setDepths] = useState<Record<string, number>>((): Record<string, number> => initialDepths(sceneKey));
  const current = useRef<Record<string, number>>(depths);

  useEffect((): (() => void) => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets: DiverTarget[] = JSON.parse(sceneKey);
    const start = current.current;
    let startedAt: number | null = null;
    let frame: number | null = null;
    let arrival: ReturnType<typeof setTimeout> | null = null;

    function update(value: Record<string, number>): void {
      current.current = value;
      setDepths(value);
    }

    function animate(timestamp: number): void {
      if (startedAt === null) startedAt = timestamp;
      const progress = Math.min((timestamp - startedAt) / DESCENT_MS, 1);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      update(Object.fromEntries(targets.map((target: DiverTarget): [string, number] => [target.id, start[target.id] + (target.depth - start[target.id]) * eased])));
      if (progress < 1) frame = requestAnimationFrame(animate);
      else arrival = setTimeout((): void => onArrive(sceneKey), ARRIVAL_PAUSE_MS);
    }

    function finish(): void {
      if (frame !== null) cancelAnimationFrame(frame);
      if (arrival !== null) clearTimeout(arrival);
      update(Object.fromEntries(targets.map((target: DiverTarget): [string, number] => [target.id, target.depth])));
      onArrive(sceneKey);
    }

    if (motion.matches || targets.every((target: DiverTarget): boolean => target.depth === start[target.id])) finish();
    else frame = requestAnimationFrame(animate);
    motion.addEventListener("change", finish);
    return (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (arrival !== null) clearTimeout(arrival);
      motion.removeEventListener("change", finish);
    };
  }, [sceneKey, onArrive]);

  return depths;
}

export default function FishDive({ players, me, sceneKey, roundIndex, totalRounds, onArrive, roundScores, children }: {
  players: PublicPlayer[];
  me: string;
  sceneKey: string;
  roundIndex: number;
  totalRounds: number;
  onArrive: (key: string) => void;
  roundScores: (number | null)[];
  children: ReactNode;
}): ReactNode {
  const depths = useAnimatedDepths(sceneKey, onArrive);
  const depth = depths[me];
  const camera = diveCameraDepth(depth);
  const descending = players.some((player: PublicPlayer): boolean => Math.abs(player.depth - depths[player.id]) > 0.5);

  return <>
    <OceanScene totalRounds={totalRounds} camera={camera} light={{ depth, left: 12 + (players.findIndex((player: PublicPlayer): boolean => player.id === me) + 1) / (players.length + 1) * 68 }} className={descending ? "is-descending" : ""}>
        {players.map((player: PublicPlayer, index: number): ReactNode => <div key={player.id} className={`ocean-diver${player.id === me ? " own-diver" : ""}${Math.abs(player.depth - depths[player.id]) > .5 ? " is-swimming" : ""}`} style={{ translate: `0 ${worldPosition(depths[player.id])}`, left: `${12 + (index + 1) / (players.length + 1) * 68}%`, "--fish-color": player.color } as CSSProperties}>
          <div className="dive-fish"><span className="dive-bubble bubble-one" /><span className="dive-bubble bubble-two" /><span className="dive-bubble bubble-three" /><FishSprite color={player.color} /></div>
          <span className="dive-fish-label">{player.name}{player.id === me ? " (you)" : ""} · {Math.round(depths[player.id])} m</span>
          {player.attempt?.result?.status === "scored" && <span className="dive-answer">“{player.attempt.answer}”</span>}
        </div>)}
    </OceanScene>
    <header className="dive-hud">
      <output className="depth-control hud-panel" aria-label={`Depth: ${Math.round(depth)} metres`} aria-live="off"><span>Depth</span><strong>{Math.round(depth).toLocaleString("en-US")} m</strong></output>
      <div className="hud-progress hud-panel" aria-label={`Round ${roundIndex + 1} of ${totalRounds}`}><div>{roundScores.map((score: number | null, index: number): ReactNode => <span key={index} className={`round-dot${score !== null ? " completed" : index === roundIndex ? " current" : ""}`} style={score === null ? undefined : { "--round-color": `hsl(${score * 120} 75% 55%)` } as CSSProperties} role="img" aria-label={`Round ${index + 1}: ${score === null ? index === roundIndex ? "in progress" : "upcoming" : `${Math.round(score * 100) * METRES_PER_POINT} metres gained`}`} title={score === null ? index === roundIndex ? "In progress" : "Upcoming" : `${Math.round(score * 100) * METRES_PER_POINT} m gained`} />)}</div><span>Round {roundIndex + 1} of {totalRounds}</span></div>
    </header>
    {children}
    <div className="offscreen-fish" aria-label="Players outside your view">{players.filter((player: PublicPlayer): boolean => player.id !== me && (depths[player.id] < camera || depths[player.id] > camera + VISIBLE_DIVE_METRES * .6)).map((player: PublicPlayer): ReactNode => <div key={player.id}><FishSprite color={player.color} /><span>{player.name} · {Math.round(depths[player.id])} m {depths[player.id] < camera ? "↑" : "↓"}</span></div>)}</div>
    <p className="sr-only" role="status">{players.map((player: PublicPlayer): string => `${player.name}: ${player.depth} metres`).join(". ")}</p>
  </>;
}
