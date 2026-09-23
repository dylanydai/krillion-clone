import type { CSSProperties, ReactNode } from "react";
import { METRES_PER_POINT, VISIBLE_DIVE_METRES } from "../lib/dive";

const TICK_METRES = 100;

export function worldPosition(metres: number): string {
  return `calc(var(--surface-height) + ${metres / VISIBLE_DIVE_METRES * 100}dvh)`;
}

export default function OceanScene({ totalRounds, camera = 0, className = "", children }: { totalRounds: number; camera?: number; className?: string; children?: ReactNode }): ReactNode {
  const maxDepth = totalRounds * 100 * METRES_PER_POINT + VISIBLE_DIVE_METRES;
  const style = { "--world-height": worldPosition(maxDepth), "--camera-pan": `${-camera / VISIBLE_DIVE_METRES * 100}dvh` } as CSSProperties;

  return <div className={`dive-scene ${className}`} style={style} aria-hidden="true">
    <div className="dive-world">
      <div className="ocean-sky"><span className="ocean-cloud cloud-left" /><span className="ocean-cloud cloud-right" /></div>
      <div className="ocean-boat" />
      <div className="ocean-water"><div className="ocean-rays" /></div>
      <div className="ocean-surface" />
      {Array.from({ length: 120 }, (_value: unknown, index: number): ReactNode => <span key={index} className="ocean-particle" style={{ left: `${(index * 37 + 11) % 99}%`, top: worldPosition((index * 173 + 29) % maxDepth), "--particle-size": `${index % 3 + 1}px`, "--particle-duration": `${7 + index % 5}s`, "--particle-delay": `${-index * .7}s` } as CSSProperties} />)}
      {Array.from({ length: totalRounds * 4 + 2 }, (_value: unknown, index: number): ReactNode => <div key={index} className={`ocean-school${index % 2 === 1 ? " swim-left" : ""}`} style={{ top: worldPosition(90 + index * 240), "--swim-delay": `${-12 - index * 7}s`, "--swim-duration": `${38 + index % 5 * 5}s` } as CSSProperties}><span /><span /><span /><span /></div>)}
      {children}
      <div className="ocean-ruler">{Array.from({ length: maxDepth / TICK_METRES + 1 }, (_value: unknown, index: number): ReactNode => <div key={index} className="ocean-depth-mark" style={{ top: worldPosition(index * TICK_METRES) }}><span>{index === 0 ? "0 m" : `−${(index * TICK_METRES).toLocaleString("en-US")} m`}</span></div>)}</div>
    </div>
  </div>;
}
