import type { Category, CategoryId } from "./types.ts";

import { ARCHIVE_CATEGORIES } from "./archive-categories.ts";
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
  ...ARCHIVE_CATEGORIES,
];

const CS_QUANT_CATEGORIES = new Set<CategoryId>([
  "languages", "firms", "data-structures", "algorithms", "databases",
  "operating-systems", "file-formats", "terminal-commands", "math-formulas",
  "machine-learning-concepts", "computer-parts", "web-browsers", "electronic-components",
  "compiler-optimizations", "graph-theory-concepts", "git-commands", "python-libraries",
  "build-tools", "web-frameworks", "command-line-shells", "llms",
  "archive-2026-08-16-7", "archive-2026-08-23-5", "archive-2026-08-24-2", "archive-2026-09-22-4", "archive-2026-09-22-5",
]);

export function categoriesForMode(girlfriendFriendly: boolean): Category[] {
  return girlfriendFriendly ? CATEGORIES.filter((category: Category): boolean => !CS_QUANT_CATEGORIES.has(category.id)) : CATEGORIES;
}

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function categoryById(id: CategoryId): Category {
  const category = CATEGORIES.find((entry: Category): boolean => entry.id === id);
  if (!category) throw new Error(`Unknown category: ${id}`);
  return category;
}
