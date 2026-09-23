import type { ReactNode } from "react";
import Game from "./game";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }): Promise<ReactNode> {
  const { code } = await params;
  return <Game code={code.toUpperCase()} />;
}
