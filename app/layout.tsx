import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ROUNDS_PER_GAME } from "../lib/game-config";
import OceanScene from "./ocean-scene";
import "./globals.css";

export const metadata: Metadata = {
  title: "Krillion Clone",
  description: "Name a real item. Find the uncommon answer. A seven-round multiplayer trivia game.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return <html lang="en"><body><OceanScene className="menu-ocean" totalRounds={ROUNDS_PER_GAME} /><main>{children}</main></body></html>;
}
