import type { ReactNode } from "react";
import type { FishColor } from "../lib/fish";

export default function FishSprite({ color }: { color: FishColor }): ReactNode {
  return <svg className="fish-sprite" viewBox="0 0 32 20" style={{ color }} shapeRendering="crispEdges" aria-hidden="true">
    <path d="M8 6h4V2h12v4h4v2h4v4h-4v4h-4v2H12v-4H8v-2H4v4H0V4h4v4h4z" fill="currentColor" />
    <path className="fish-highlight" d="M12 6h12v2H12z" />
    <path d="M22 8h4v4h-4z" fill="#10192b" />
    <path className="fish-shadow" d="M12 14h8v4h-8z" />
  </svg>;
}
