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

const CS_QUANT_CATEGORIES = new Set<CategoryId>([
  "languages", "firms", "data-structures", "algorithms", "databases",
  "operating-systems", "file-formats", "terminal-commands", "math-formulas",
  "machine-learning-concepts", "computer-parts", "web-browsers", "electronic-components",
  "compiler-optimizations", "graph-theory-concepts", "git-commands", "python-libraries",
  "build-tools", "web-frameworks", "command-line-shells", "llms",
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
