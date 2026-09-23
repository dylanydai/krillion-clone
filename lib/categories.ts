import type { Category, CategoryId } from "./types.ts";

import { ADDITIONAL_CATEGORIES } from "./prompt-pack.ts";

export const CATEGORIES: Category[] = [
  {
    id: "languages",
    title: "Programming languages",
    prompt: "Name a programming language",
  },
  {
    id: "firms",
    title: "Quantitative trading firms",
    prompt: "Name a quantitative trading firm",
  },
  ...ADDITIONAL_CATEGORIES,
];

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function categoryById(id: CategoryId): Category {
  const category = CATEGORIES.find((entry: Category): boolean => entry.id === id);
  if (!category) throw new Error(`Unknown category: ${id}`);
  return category;
}
