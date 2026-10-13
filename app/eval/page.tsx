import { CATEGORIES } from "../../lib/categories";
import EvalForm from "./eval-form";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function EvalPage(): ReactNode {
  return <EvalForm categories={CATEGORIES} />;
}
