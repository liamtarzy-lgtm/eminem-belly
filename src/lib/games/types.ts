// Shared types for the games. All content is locally-supplied — placeholder
// data ships in snippets.ts / lyrics.ts; users replace with their own
// licensed snippets + manually-entered lyric excerpts.

export type Difficulty = "easy" | "medium" | "hard";

export type SessionLength = 5 | 10 | "endless";

// A "Guess the Song in 2 Seconds" round.
export type Snippet = {
  id: string;
  songTitle: string;
  album: string;
  year: number;
  difficulty: Difficulty;
  /** Path or URL to the audio file (~2 sec). User provides the file. */
  audioSrc: string;
  /** Optional offset into a longer file. If undefined, plays from 0. */
  startTimeSeconds?: number;
  /** Length of the snippet in seconds — controls auto-stop. Defaults 2.0. */
  durationSeconds?: number;
  /**
   * Three plausible wrong answers (song titles). Curate for similarity:
   * same era, similar tempo/theme/popularity. Avoid obviously wrong picks
   * unless difficulty intentionally allows it.
   */
  similarWrongChoices: [string, string, string];
  /** Shown on the result screen for context. Optional. */
  funFact?: string;
};

// A "Finish the Bar" round.
export type Lyric = {
  id: string;
  songTitle: string;
  album: string;
  year: number;
  difficulty: Difficulty;
  /** First half of the bar. Keep short — single bar / partial bar. */
  promptText: string;
  /**
   * The accepted continuations. First entry is canonical; subsequent
   * entries cover alternate phrasings the user might type. All compared
   * after normalization (lowercase, stripped punctuation).
   */
  acceptedAnswers: string[];
  /** Optional gentle hint shown on first hint use. */
  hint?: string;
};

// Per-round outcome result, used by the result screen + summary.
export type RoundResult = {
  correct: boolean;
  closeMatch?: boolean; // game 2 fuzzy match
  pointsEarned: number;
  hintsUsed: number;
  replayUsed: boolean;
  timedOut?: boolean;
};

export type GameId = "guess-the-song" | "finish-the-bar";
