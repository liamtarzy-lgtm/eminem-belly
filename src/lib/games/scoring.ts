// Scoring rules shared by both games.

export const POINTS = {
  // Game 1 — Guess the Song
  guessCorrect: 100,
  // Game 2 — Finish the Bar
  finishExact: 150,
  finishClose: 100,
  // Both games
  streakBonusPerStep: 25,
  hintPenalty: 25, // per hint used (Game 2)
  replayPenalty: 25, // per replay (Game 1)
};

export type ScoreInput = {
  base: number; // 0 if wrong
  hintsUsed?: number;
  replayUsed?: boolean;
  streakAfter: number; // current streak count AFTER this round (0 if wrong)
};

export function computeRoundScore({
  base,
  hintsUsed = 0,
  replayUsed = false,
  streakAfter,
}: ScoreInput): number {
  if (base <= 0) return 0; // wrong answers never go negative
  const penalty =
    hintsUsed * POINTS.hintPenalty + (replayUsed ? POINTS.replayPenalty : 0);
  const adjusted = Math.max(0, base - penalty);
  // Streak bonus only applies when correct. Bonus = (streak - 1) × per-step,
  // i.e. the *first* correct in a streak gets no bonus, the second adds 25,
  // the third adds 50, etc.
  const streakBonus = Math.max(0, streakAfter - 1) * POINTS.streakBonusPerStep;
  return adjusted + streakBonus;
}

// localStorage helpers — separate keys per game so high scores don't
// collide. Pure client-side, never written from server code.
const HIGH_SCORE_KEY = (gameId: string) => `eminemBelly_${gameId}_highScore`;
const BEST_STREAK_KEY = (gameId: string) =>
  `eminemBelly_${gameId}_bestStreak`;

export function getHighScore(gameId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(HIGH_SCORE_KEY(gameId));
  return raw ? Number(raw) || 0 : 0;
}

export function setHighScore(gameId: string, score: number): boolean {
  if (typeof window === "undefined") return false;
  const current = getHighScore(gameId);
  if (score > current) {
    window.localStorage.setItem(HIGH_SCORE_KEY(gameId), String(score));
    return true;
  }
  return false;
}

export function getBestStreak(gameId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(BEST_STREAK_KEY(gameId));
  return raw ? Number(raw) || 0 : 0;
}

export function setBestStreak(gameId: string, streak: number): boolean {
  if (typeof window === "undefined") return false;
  const current = getBestStreak(gameId);
  if (streak > current) {
    window.localStorage.setItem(BEST_STREAK_KEY(gameId), String(streak));
    return true;
  }
  return false;
}
