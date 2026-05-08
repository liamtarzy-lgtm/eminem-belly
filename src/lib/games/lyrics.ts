import type { Lyric } from "./types";

/**
 * PLACEHOLDER DATA — REPLACE WITH YOUR OWN.
 *
 * Each entry is a SHORT lyric prompt with one or more accepted
 * continuations. Keep prompts to a single bar / partial bar — a few
 * words shown, a few words to type. Don't paste long lyric passages.
 *
 * Acceptable answers are matched after normalizing: lowercase, stripped
 * punctuation/apostrophes, collapsed whitespace. Small typos are accepted
 * via Levenshtein distance (see fuzzy.ts).
 *
 * Provide all variations a user might reasonably type — e.g. "wanna" vs
 * "want to" — so the matcher accepts either.
 *
 * Only use lyric excerpts you have the right to share / quote. Don't
 * paste full songs.
 */

export const LYRICS: Lyric[] = [
  {
    id: "lyric-placeholder-1",
    songTitle: "REPLACE — real song title",
    album: "REPLACE",
    year: 2000,
    difficulty: "easy",
    promptText: "REPLACE — first half of the bar (a few words)",
    acceptedAnswers: [
      "replace with the canonical continuation",
      "replace with an alternate phrasing if applicable",
    ],
    hint: "REPLACE — optional gentle hint, e.g. theme of the line",
  },
  {
    id: "lyric-placeholder-2",
    songTitle: "REPLACE — real song title",
    album: "REPLACE",
    year: 2002,
    difficulty: "medium",
    promptText: "REPLACE — prompt text",
    acceptedAnswers: ["replace with continuation"],
  },
  {
    id: "lyric-placeholder-3",
    songTitle: "REPLACE — real song title",
    album: "REPLACE",
    year: 2010,
    difficulty: "hard",
    promptText: "REPLACE — prompt text",
    acceptedAnswers: ["replace with continuation"],
    hint: "REPLACE — optional",
  },
];
