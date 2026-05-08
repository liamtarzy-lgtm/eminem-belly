import type { Snippet } from "./types";

/**
 * PLACEHOLDER DATA — REPLACE WITH YOUR OWN.
 *
 * To add a real round:
 *   1. Cut a ~2-second clip of Eminem actually rapping (not a hook,
 *      not silence, not a skit). Save it to public/audio/eminem/ as
 *      `snippet-XYZ.mp3` (or .m4a / .ogg).
 *   2. Add an entry below with:
 *        - id: stable unique string
 *        - songTitle: the real answer
 *        - album / year
 *        - difficulty: easy/medium/hard
 *        - audioSrc: "/audio/eminem/snippet-XYZ.mp3"
 *        - similarWrongChoices: 3 distractors that are plausibly close
 *          (same era / energy / theme). Avoid wildly wrong choices
 *          unless difficulty=hard intentionally requires it.
 *        - funFact (optional)
 *   3. The game UI handles randomization, timer, replay, scoring.
 *
 * Make sure you have the rights to use any audio you upload — do NOT
 * scrape from streaming platforms.
 */

export const SNIPPETS: Snippet[] = [
  {
    id: "snippet-placeholder-1",
    songTitle: "REPLACE — real song title",
    album: "REPLACE — album name",
    year: 2000,
    difficulty: "easy",
    audioSrc: "/audio/eminem/snippet-001.mp3",
    durationSeconds: 2,
    similarWrongChoices: [
      "REPLACE — wrong choice 1 (same era, similar energy)",
      "REPLACE — wrong choice 2 (similar theme)",
      "REPLACE — wrong choice 3 (similar tempo)",
    ],
    funFact:
      "REPLACE — optional context shown on the result screen. Trivia, sample story, behind-the-scenes detail, etc.",
  },
  {
    id: "snippet-placeholder-2",
    songTitle: "REPLACE — real song title",
    album: "REPLACE",
    year: 2002,
    difficulty: "medium",
    audioSrc: "/audio/eminem/snippet-002.mp3",
    durationSeconds: 2,
    similarWrongChoices: [
      "REPLACE — wrong choice 1",
      "REPLACE — wrong choice 2",
      "REPLACE — wrong choice 3",
    ],
  },
  {
    id: "snippet-placeholder-3",
    songTitle: "REPLACE — real song title",
    album: "REPLACE",
    year: 2010,
    difficulty: "hard",
    audioSrc: "/audio/eminem/snippet-003.mp3",
    durationSeconds: 2,
    similarWrongChoices: [
      "REPLACE — wrong choice 1",
      "REPLACE — wrong choice 2",
      "REPLACE — wrong choice 3",
    ],
  },
];
