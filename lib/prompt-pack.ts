export const ADDITIONAL_CATEGORIES = [
  {
    id: "data-structures",
    title: "Data structures",
    prompt: "Name a data structure",
  },
  {
    id: "algorithms",
    title: "Algorithms",
    prompt: "Name an algorithm",
  },
  {
    id: "databases",
    title: "Database systems",
    prompt: "Name a database system",
  },
  {
    id: "operating-systems",
    title: "Operating systems",
    prompt: "Name an operating system",
  },
  {
    id: "file-formats",
    title: "File formats",
    prompt: "Name a file format",
  },
  {
    id: "terminal-commands",
    title: "Unix commands",
    prompt: "Name a Unix command-line utility",
  },
  {
    id: "math-formulas",
    title: "Math formulas",
    prompt: "Name a mathematical formula",
  },
  {
    id: "musical-instruments",
    title: "Musical instruments",
    prompt: "Name a musical instrument",
  },
  {
    id: "mythical-creatures",
    title: "Mythological creatures",
    prompt: "Name a creature from mythology or folklore",
  },
  {
    id: "ocean-animals",
    title: "Ocean animals",
    prompt: "Name an ocean animal",
  },
  {
    id: "chess-openings",
    title: "Chess openings",
    prompt: "Name a chess opening",
  },
  {
    id: "rhetorical-devices",
    title: "Rhetorical devices",
    prompt: "Name a rhetorical device or figure of speech",
  },
  {
    id: "pasta-shapes",
    title: "Pasta shapes",
    prompt: "Name a pasta shape",
  },
  {
    id: "architectural-features",
    title: "Architectural features",
    prompt: "Name an architectural feature",
  },
  {
    id: "cloud-types",
    title: "Cloud types",
    prompt: "Name a type of cloud",
  },
  {
    id: "board-games",
    title: "Board games",
    prompt: "Name a board game",
  },
  {
    id: "foods-ending-in-a",
    title: "Foods ending in A",
    prompt: "Name a food whose name ends in the letter A",
  },
  {
    id: "furniture",
    title: "Furniture",
    prompt: "Name an item of furniture",
  },
  {
    id: "subreddits",
    title: "Subreddits",
    prompt: "Name a subreddit",
  },
  {
    id: "birds",
    title: "Birds",
    prompt: "Name a bird",
  },
  {
    id: "chemical-elements",
    title: "Chemical elements",
    prompt: "Name a chemical element",
  },
  {
    id: "cheeses",
    title: "Types of cheese",
    prompt: "Name a type of cheese",
  },
  {
    id: "south-african-animals",
    title: "Animals in South Africa",
    prompt: "Name an animal that lives in South Africa",
  },
  {
    id: "islands",
    title: "Islands",
    prompt: "Name an island",
  },
] as const;

export type AdditionalCategoryId = typeof ADDITIONAL_CATEGORIES[number]["id"];
