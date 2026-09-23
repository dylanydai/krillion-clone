"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { parseFishColor, type FishColor } from "../lib/fish";
import FishSprite from "./fish-sprite";

export default function FishCustomizer({ color, busy, onSave }: { color: FishColor; busy: boolean; onSave: (color: FishColor) => Promise<void> }): ReactNode {
  const [draft, setDraft] = useState<string>(color);
  const [preview, setPreview] = useState<FishColor>(color);

  function change(value: string): void {
    setDraft(value);
    if (/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(value)) setPreview(parseFishColor(value));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onSave(parseFishColor(draft));
  }

  return <form onSubmit={submit}>
    <fieldset className="fish-customizer" disabled={busy} style={{ "--fish-color": preview } as CSSProperties}>
      <legend>Your fish colour</legend>
      <div className="fish-preview"><FishSprite color={preview} /><span>{preview}</span></div>
      <label htmlFor="fish-hex">Hex colour</label>
      <div className="hex-controls">
        <input type="color" aria-label="Pick fish colour" value={preview} onChange={(event): void => change(event.target.value.toUpperCase())} />
        <input id="fish-hex" value={draft} onChange={(event): void => change(event.target.value)} pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?" title="Use #RGB or #RRGGBB, such as #80DFEB." maxLength={7} required spellCheck={false} autoComplete="off" placeholder="#80DFEB" />
        <button disabled={busy || preview === color && draft.toUpperCase() === color}>Save</button>
      </div>
    </fieldset>
  </form>;
}
