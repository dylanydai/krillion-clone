"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, ClientError } from "../../../lib/client";
import { ROUND_SECONDS } from "../../../lib/game-config";
import { diveProgress, diveSceneKey, METRES_PER_POINT } from "../../../lib/dive";
import type { FishColor } from "../../../lib/fish";
import FishCustomizer from "../../fish-customizer";
import FishSprite from "../../fish-sprite";
import FishDive from "./fish-dive";
import type { Attempt, PublicPlayer, RoomView } from "../../../lib/types";

function attemptLabel(attempt: Attempt | null): string {
  if (attempt === null) return "No answer";
  if (attempt.skipped) return "Skipped";
  if (attempt.status === "judging") return "Judging…";
  if (attempt.result === null) return "Waiting for the judge";
  if (attempt.result.score !== null) return `+${Math.round(attempt.result.score * 100) * METRES_PER_POINT} m`;
  if (attempt.result.message === null) return "No depth earned";
  return attempt.result.message;
}

function roundPoints(player: PublicPlayer): number | null {
  const result = player.attempt?.result;
  return result?.status === "scored" && result.score !== null ? Math.round(result.score * 100) : null;
}

function ResultsPopup({ children }: { children: ReactNode }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect((): (() => void) => {
    const element = dialog.current;
    if (element === null) throw new Error("The results dialog did not mount.");
    element.showModal();
    return (): void => element.close();
  }, []);
  return <dialog ref={dialog} className="results-popup" aria-labelledby="results-heading" onCancel={(event): void => event.preventDefault()}>{children}</dialog>;
}

export default function Game({ code }: { code: string }): ReactNode {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [needsJoin, setNeedsJoin] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [copied, setCopied] = useState<boolean>(false);
  const [settledScene, setSettledScene] = useState<string | null>(null);
  const offset = useRef<number>(0);
  const acceptedVersion = useRef<number>(-1);
  const answerInput = useRef<HTMLInputElement>(null);
  const countdown = room?.phase === "playing" && room.startsAt !== null ? Math.max(0, Math.ceil((room.startsAt - now) / 1000)) : 0;

  const receive = useCallback((next: RoomView): void => {
    if (next.version < acceptedVersion.current) return;
    acceptedVersion.current = next.version;
    offset.current = next.serverNow - Date.now();
    setNow(next.serverNow);
    setRoom(next);
    setNeedsJoin(false);
  }, []);

  useEffect((): (() => void) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll(): Promise<void> {
      try {
        const next = await api<RoomView>(`/api/rooms/${code}`, undefined, controller.signal);
        if (!stopped) { receive(next); setConnectionError(null); }
      } catch (cause: unknown) {
        if (controller.signal.aborted) return;
        if (cause instanceof ClientError && cause.code === "NOT_JOINED") setNeedsJoin(true);
        else setConnectionError(cause instanceof Error ? cause.message : "Could not refresh the room.");
      }
      if (!stopped) timer = setTimeout((): void => { void poll(); }, 1500);
    }
    void poll();
    return (): void => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [code, receive]);

  useEffect((): (() => void) => {
    const timer = setInterval((): void => setNow(Date.now() + offset.current), 200);
    return (): void => clearInterval(timer);
  }, []);

  useEffect((): void => { setAnswer(""); setError(null); }, [room?.roundIndex, room?.phase]);
  useEffect((): void => {
    if (countdown === 0 && room?.phase === "playing") answerInput.current?.focus();
  }, [countdown, room?.roundIndex, room?.phase]);

  async function act(action: string, fields: Record<string, unknown> = {}): Promise<void> {
    if (busy !== null) return;
    setBusy(action);
    setError(null);
    const controller = new AbortController();
    const deadlineTimer = (action === "answer" || action === "retry") && room?.endsAt !== null && room?.endsAt !== undefined
      ? setTimeout((): void => controller.abort("round-deadline"), Math.max(0, room.endsAt - Date.now() - offset.current))
      : undefined;
    try {
      receive(await api<RoomView>(`/api/rooms/${code}`, { action, ...fields }, controller.signal));
    } catch (cause: unknown) {
      if (controller.signal.reason !== "round-deadline") setError(cause instanceof Error ? cause.message : "The action failed. Try again.");
    } finally {
      clearTimeout(deadlineTimer);
      setBusy(null);
    }
  }

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? `Could not copy the invite: ${cause.message}. Share room code ${code}.` : `Share room code ${code}.`);
    }
  }

  const heading = <header className="room-header"><span className="room-code-label">Room <strong className="code">{code}</strong></span><span className="brand-fish" aria-hidden="true" /></header>;
  if (room === null) return <><section className="panel"><h1>{needsJoin ? "Join this room" : "Opening room…"}</h1>
    {needsJoin && <form onSubmit={(event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); void act("join", { name }); }}>
      <label htmlFor="name">Your name</label><input id="name" value={name} onChange={(event): void => setName(event.target.value)} maxLength={24} required autoComplete="nickname" />
      <button disabled={busy !== null}>Join room</button>
    </form>}
    {connectionError !== null && <p className="error" role="alert">{connectionError}</p>}{error !== null && <p className="error" role="alert">{error}</p>}
  </section></>;

  const me = room.players.find((player: PublicPlayer): boolean => player.id === room.me);
  if (me === undefined) throw new Error("The room response is missing the current player.");
  const host = room.hostId === room.me;
  const own = me.attempt;
  const dive = diveProgress(me, room.phase);
  const seconds = room.endsAt === null ? 0 : Math.min(ROUND_SECONDS, Math.max(0, Math.ceil((room.endsAt - now) / 1000)));
  const roundFields = { roundIndex: room.roundIndex };
  const locked = own?.result?.status === "scored" || own?.status === "judging" || own?.skipped === true;
  const submitting = busy === "answer" || busy === "retry";
  const hidePrompt = submitting || locked;
  const showAnswer = !submitting && room.phase === "playing" && seconds > 0 && !locked;
  const canAnswer = showAnswer && countdown === 0;
  const timeRunningOut = room.phase === "playing" && countdown === 0 && seconds > 0 && room.endsAt !== null && room.endsAt - now < 5000;
  const canRetry = own?.status === "done" && (own.result?.status === "retryable_error" || own.result?.errorCode === "SCORE_UNCERTAIN");
  const revealed = room.phase === "results" || room.phase === "leaderboard" || room.phase === "finished";
  const hasJudging = room.players.some((player: PublicPlayer): boolean => player.state === "judging");
  const roundScores = Array.from({ length: room.totalRounds }, (_value: unknown, index: number): number | null => {
    const completed = room.history[index];
    if (completed !== undefined) {
      const result = completed.results.find((entry): boolean => entry.playerId === room.me);
      if (result === undefined) throw new Error("Round history is missing the current player.");
      return result.attempt?.result?.score ?? 0;
    }
    if (index === room.roundIndex && own?.result?.status === "scored") return own.result.score;
    if (index === room.roundIndex && own?.skipped) return 0;
    return null;
  });
  const leaders = room.players.filter((player: PublicPlayer): boolean => player.points === Math.max(...room.players.map((entry: PublicPlayer): number => entry.points)));
  const sceneKey = diveSceneKey(room.players);
  const diving = settledScene !== sceneKey;
  const playerList = <ul className="players leaderboard">{[...room.players].sort((a: PublicPlayer, b: PublicPlayer): number => b.depth - a.depth).map((player: PublicPlayer): ReactNode => <li key={player.id}>
    <div className="player-heading"><strong><FishSprite color={player.color} />{player.name}{player.id === room.me ? " (you)" : ""}{player.id === room.hostId ? " · host" : ""}</strong></div>
  </li>)}</ul>;

  return <div className={room.phase === "lobby" ? "lobby-screen" : `game-screen${diving && locked ? " is-diving" : ""}`}>{room.phase === "lobby" && heading}
    <div className="game-alerts">
    {connectionError !== null && <p className="error" role="alert">Connection issue: {connectionError} Reconnecting…</p>}
    {error !== null && <p className="error" role="alert">{error}</p>}
    </div>
    {room.phase === "lobby" && <section className="panel">
      <h1>Waiting room</h1><p>{room.players.length} {room.players.length === 1 ? "player" : "players"} · {room.totalRounds} rounds · {ROUND_SECONDS} seconds per round</p>
      <FishCustomizer key={me.color} color={me.color} busy={busy !== null} onSave={(color: FishColor): Promise<void> => act("customize", { color })} />
      <div className="actions"><button onClick={(): void => { void copyInvite(); }} className="secondary">{copied ? "Invite copied" : "Copy invite link"}</button>
        {host ? <button disabled={busy !== null} onClick={(): void => { void act("start"); }}>Start game</button> : <p>Waiting for the host to start.</p>}</div>
    </section>}
    {room.phase !== "lobby" && <FishDive players={room.players} me={room.me} sceneKey={sceneKey} roundIndex={room.roundIndex} totalRounds={room.totalRounds} onArrive={setSettledScene} roundScores={roundScores}>
      {!hidePrompt && <section key={room.roundIndex} className="game-prompt">
        <div className="prompt-number">Prompt {room.roundIndex + 1} of {room.totalRounds}</div>
        <h1>{room.category?.prompt}</h1>
        <p className="prompt-hint">Rarer answers sink deeper</p>
      </section>}
      {countdown > 0 && <div className="round-countdown" role="status"><span>Round starts in</span><strong key={countdown}>{countdown}</strong></div>}
      <section className="answer-dock" aria-label="Round controls">
      {submitting && own === null && <p className="round-status" role="status">Submitting and judging your answer…</p>}
      {own !== null && <div className="round-status" role="status"><strong>{own.answer || "Skipped"}</strong><span>{attemptLabel(own)}</span>
        {own.result?.status === "scored" && <span>{diving ? `Diving ${dive.roundPoints * METRES_PER_POINT} metres deeper…` : room.phase === "playing" ? "Waiting for the other players." : "Round complete."}</span>}
        {canRetry && room.phase === "playing" && seconds > 0 && <button className="secondary" disabled={busy !== null} onClick={(): void => { void act("retry", roundFields); }}>Retry saved answer</button>}
      </div>}
      {showAnswer && <form className="answer-form" onSubmit={(event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); if (canAnswer) void act("answer", { ...roundFields, answer }); }}>
        <label htmlFor="answer" className="sr-only">Your answer</label><input ref={answerInput} key={room.roundIndex} id="answer" value={answer} onChange={(event): void => setAnswer(event.target.value)} autoComplete="off" maxLength={120} required disabled={busy !== null || !canAnswer} placeholder={countdown > 0 ? "get ready…" : "type one answer…"} />
        <button className="dive-control" disabled={busy !== null || !canAnswer}>Dive</button>
      </form>}
      {room.phase === "playing" && <div className={`round-time-track${timeRunningOut ? " running-out" : ""}`} role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={ROUND_SECONDS} aria-valuenow={seconds}><span style={{ transform: `scaleX(${room.endsAt === null || room.startsAt === null ? 0 : Math.max(0, Math.min(1, (room.endsAt - now) / (room.endsAt - room.startsAt)))})` }} /></div>}
      {timeRunningOut && <span className="sr-only" role="alert">Less than five seconds remaining.</span>}
      {room.phase === "playing" && seconds === 0 && <p role="status">Time is up. Showing results…</p>}
      </section>
    </FishDive>}
    {room.phase === "lobby" && <section className="panel"><h2>Players</h2>{playerList}</section>}
    {revealed && !diving && <ResultsPopup>
      <div key={room.phase} className="popup-content">
      <span className="result-fish"><FishSprite color={me.color} /></span>
      <h2 id="results-heading" tabIndex={-1} autoFocus>{room.phase === "results" ? `Round ${room.roundIndex + 1} results` : room.phase === "finished" ? "Final leaderboard" : "Total leaderboard"}</h2>
      {room.phase === "results" ? <>
        <p className="round-prompt">{room.category?.prompt}</p>
        <p className="result-depth">Your depth: {(dive.totalPoints * METRES_PER_POINT).toLocaleString("en-US")} m <span>+{dive.roundPoints * METRES_PER_POINT} m this round</span></p>
        <p className="muted">Depth gained this round</p>
        <ul className="players leaderboard">{[...room.players].sort((a: PublicPlayer, b: PublicPlayer): number => (roundPoints(b) ?? -1) - (roundPoints(a) ?? -1)).map((player: PublicPlayer): ReactNode => <li key={player.id}>
          <div className="player-heading"><strong><FishSprite color={player.color} />{player.name}{player.id === room.me ? " (you)" : ""}<span className="leaderboard-guess"> - {player.attempt?.answer || (player.attempt?.skipped ? "Skipped" : "No answer")}</span></strong><span>{roundPoints(player) === null ? "—" : `+${player.depth - player.previousDepth} m`}</span></div>
          {player.attempt !== null && !player.attempt.skipped && player.attempt.result?.score === null && <p className="muted">{attemptLabel(player.attempt)}</p>}
        </li>)}</ul>
      </> : <>
        <p>Total depth after {room.roundIndex + 1} {room.roundIndex === 0 ? "round" : "rounds"}</p>
        {room.phase === "finished" && <p className="winner">{leaders.map((player: PublicPlayer): string => player.name).join(" & ")} {leaders.length > 1 ? "tie for first" : "wins"}!</p>}
        <ul className="players leaderboard">{[...room.players].sort((a: PublicPlayer, b: PublicPlayer): number => b.points - a.points).map((player: PublicPlayer): ReactNode => <li key={player.id}>
          <div className="player-heading"><strong><FishSprite color={player.color} />{player.name}{player.id === room.me ? " (you)" : ""}{room.phase !== "finished" && <span className="leaderboard-guess"> - {player.attempt?.answer || (player.attempt?.skipped ? "Skipped" : "No answer")}</span>}</strong><span>{player.depth} m</span></div>
        </li>)}</ul>
      </>}
      {connectionError !== null && <p className="error" role="alert">Connection issue: {connectionError} Reconnecting…</p>}
      {error !== null && <p className="error" role="alert">{error}</p>}
      {host ? <button disabled={busy !== null || hasJudging} onClick={(): void => { void act(room.phase === "finished" ? "rematch" : "next"); }}>{room.phase === "results" ? "Next" : room.phase === "finished" ? "Open rematch lobby" : "Start next round"}</button> : <p role="status">Waiting for the host to {room.phase === "results" ? "show the leaderboard" : room.phase === "finished" ? "open a rematch" : "start the next round"}.</p>}
      {room.phase === "finished" && <section className="answer-history" aria-label="Your answers"><h3>Your answers</h3>{room.history.map((round, index: number): ReactNode => {
        const result = round.results.find((entry): boolean => entry.playerId === room.me);
        if (result === undefined) throw new Error("Round history is missing your answer.");
        const attempt = result.attempt;
        const score = attempt?.result?.score;
        return <div key={round.category.id}>
          <p className="round-prompt">Round {index + 1}: {round.category.prompt}</p>
          <ul className="players leaderboard"><li>
            <div className="player-heading"><strong><FishSprite color={me.color} />{me.name} (you)<span className="leaderboard-guess"> - {attempt?.answer || (attempt?.skipped ? "Skipped" : "No answer")}</span></strong><span>{score === null || score === undefined ? "—" : `+${Math.round(score * 100) * METRES_PER_POINT} m`}</span></div>
            {attempt !== null && !attempt.skipped && attempt.result?.score === null && <p className="muted">{attemptLabel(attempt)}</p>}
          </li></ul>
        </div>;
      })}</section>}
      </div>
    </ResultsPopup>}
  </div>;
}
