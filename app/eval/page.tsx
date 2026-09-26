import { notFound } from "next/navigation";
import { CATEGORIES } from "../../lib/categories";
import EvalForm from "./eval-form";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function EvalPage(): ReactNode {
  if (process.env.EVAL_MODE !== "1") notFound();
  return <EvalForm categories={CATEGORIES} />;
}
