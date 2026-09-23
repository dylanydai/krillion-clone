"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client";
import type { RoomView } from "../lib/types";
import { ROUNDS_PER_GAME, ROUND_SECONDS } from "../lib/game-config";

export default function Home(): ReactNode {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    try {
      const joining = action === "join";
      if (joining && !/^[A-Z]{4}$/.test(code)) throw new Error("Enter the four-letter room code.");
      const room = await api<RoomView>(joining ? `/api/rooms/${code.trim().toUpperCase()}` : "/api/rooms", joining ? { action: "join", name } : { name });
      router.push(`/room/${room.code}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not enter the room.");
      setBusy(false);
    }
  }

  return <div className="home-screen">
    <header className="brand"><span className="brand-fish" aria-hidden="true" /><h1>Krillion <span>Clone</span></h1></header>
    <section className="panel home-panel">
      <h2>Play with friends</h2>
      <p>{ROUNDS_PER_GAME} random prompts, {ROUND_SECONDS} seconds each. Share a room link to invite your friends.</p>
      <form onSubmit={enter}>
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" value={name} onChange={(event): void => setName(event.target.value)} required maxLength={24} autoComplete="nickname" />
        <button type="submit" value="create" disabled={busy}>{busy ? "Connecting…" : "Create a room"}</button>
        <div className="divider"><span>or join your crew</span></div>
        <label htmlFor="code">Room code</label>
        <input id="code" name="code" className="code" value={code} onChange={(event): void => setCode(event.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 4))} maxLength={4} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD" />
        <button type="submit" value="join" className="secondary" disabled={busy}>Join room</button>
      </form>
      {error !== null && <p className="error" role="alert">{error}</p>}
    </section>
  </div>;
}
