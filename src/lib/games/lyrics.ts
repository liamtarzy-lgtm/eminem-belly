import type { Lyric } from "./types";

// Lyric prompt data lives here when it exists. We deliberately ship NO
// content — the game is disabled until lyric prompts are added through
// a future admin tool (similar to the segment editor for Game 1) or
// manually inserted with appropriate rights.
//
// Schema example for future entries:
//
//   {
//     id: "lyric-001",
//     songTitle: "...",
//     album: "...",
//     year: 2002,
//     difficulty: "medium",
//     promptText: "first part of the bar...",
//     acceptedAnswers: ["the rest of the bar", "alternate phrasing"],
//     hint: "optional one-line hint",
//   }
export const LYRICS: Lyric[] = [];
