"use client";

import { useEffect, useRef, useState } from "react";
import type { Difficulty, Lyric, SessionLength } from "@/lib/games/types";
import { LYRICS } from "@/lib/games/lyrics";
import { checkAnswer } from "@/lib/games/fuzzy";
import {
  computeRoundScore,
  getBestStreak,
  getHighScore,
  setBestStreak,
  setHighScore,
} from "@/lib/games/scoring";
import { trackEvent } from "@/lib/games/analytics";
import { ScoreHeader } from "./ScoreHeader";
import { AnswerFeedback } from "./AnswerFeedback";
import { GameSummary } from "./GameSummary";

const GAME_ID = "finish-the-bar";

type Phase = "start" | "playing" | "result" | "summary";

function pickPool(difficulty: Difficulty | "all"): Lyric[] {
  return difficulty === "all"
    ? LYRICS
    : LYRICS.filter((l) => l.difficulty === difficulty);
}

export function FinishTheBar() {
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [sessionLength, setSessionLength] = useState<SessionLength>(10);
  const [phase, setPhase] = useState<Phase>("start");

  const [pool, setPool] = useState<Lyric[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Lyric | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScore, setHighScoreState] = useState(0);
  const [bestStreakState, setBestStreakState] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isNewBestStreak, setIsNewBestStreak] = useState(false);

  const [input, setInput] = useState("");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resultMatch, setResultMatch] = useState<"exact" | "close" | "miss">(
    "miss",
  );
  const [resultPoints, setResultPoints] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHighScoreState(getHighScore(GAME_ID));
    setBestStreakState(getBestStreak(GAME_ID));
  }, []);

  function startNextRound(currentPool: Lyric[], currentUsedIds: Set<string>) {
    const remaining = currentPool.filter((l) => !currentUsedIds.has(l.id));
    if (remaining.length === 0) {
      finishGame();
      return;
    }
    const lyric = remaining[Math.floor(Math.random() * remaining.length)];
    setCurrent(lyric);
    setUsedIds(new Set([...currentUsedIds, lyric.id]));
    setRoundIndex((i) => i + 1);
    setHintsUsed(0);
    setInput("");
    setResultPoints(0);
    setResultMatch("miss");
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function submitAnswer() {
    if (!current || submitting) return;
    setSubmitting(true);
    const { match, bestAnswer } = checkAnswer(input, current.acceptedAnswers);
    const isCorrect = match === "exact" || match === "close";
    const newStreak = isCorrect ? streak + 1 : 0;
    const base =
      match === "exact" ? 150 : match === "close" ? 100 : 0;
    const points = computeRoundScore({
      base,
      hintsUsed,
      streakAfter: newStreak,
    });
    setScore((s) => s + points);
    setStreak(newStreak);
    if (isCorrect) setCorrectCount((c) => c + 1);
    setResultMatch(match);
    setResultPoints(points);
    setPhase("result");
    setSubmitting(false);
    trackEvent("question_answered", {
      gameId: GAME_ID,
      lyricId: current.id,
      match,
      hintsUsed,
      streakAfter: newStreak,
    });
    void bestAnswer; // first accepted is shown in feedback; bestAnswer informational
  }

  function useHint() {
    if (!current || hintsUsed >= 2) return;
    setHintsUsed((h) => h + 1);
    trackEvent("hint_used", {
      gameId: GAME_ID,
      lyricId: current.id,
      hintNumber: hintsUsed + 1,
    });
  }

  function finishGame() {
    const newHigh = setHighScore(GAME_ID, score);
    const newBest = setBestStreak(GAME_ID, Math.max(bestStreakState, streak));
    setIsNewHigh(newHigh);
    setIsNewBestStreak(newBest);
    setHighScoreState(getHighScore(GAME_ID));
    setBestStreakState(getBestStreak(GAME_ID));
    setPhase("summary");
    trackEvent("game_completed", {
      gameId: GAME_ID,
      score,
      rounds: roundIndex,
      correct: correctCount,
    });
  }

  function startGame() {
    const filtered = pickPool(difficulty);
    if (filtered.length === 0) return;
    setPool(filtered);
    setUsedIds(new Set());
    setRoundIndex(0);
    setCorrectCount(0);
    setScore(0);
    setStreak(0);
    setIsNewHigh(false);
    setIsNewBestStreak(false);
    trackEvent("game_started", {
      gameId: GAME_ID,
      difficulty,
      sessionLength: String(sessionLength),
    });
    startNextRound(filtered, new Set());
  }

  function handleNext() {
    if (sessionLength !== "endless" && roundIndex >= sessionLength) {
      finishGame();
      return;
    }
    startNextRound(pool, usedIds);
  }

  return (
    <div className="flex flex-col gap-4">
      {phase === "start" && (
        <StartScreen
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          sessionLength={sessionLength}
          setSessionLength={setSessionLength}
          highScore={highScore}
          bestStreak={bestStreakState}
          onStart={startGame}
        />
      )}

      {(phase === "playing" || phase === "result") && current && (
        <>
          <ScoreHeader
            score={score}
            highScore={highScore}
            streak={streak}
            bestStreak={bestStreakState}
            round={roundIndex}
            totalRounds={sessionLength}
          />

          <PromptCard
            promptText={current.promptText}
            hintsUsed={hintsUsed}
            answerForHint={current.acceptedAnswers[0] ?? ""}
            customHint={current.hint}
          />

          {phase === "playing" && (
            <AnswerForm
              value={input}
              onChange={setInput}
              onSubmit={submitAnswer}
              onHint={useHint}
              hintsUsed={hintsUsed}
              hasCustomHint={!!current.hint}
              inputRef={inputRef}
            />
          )}

          {phase === "result" && (
            <>
              <AnswerFeedback
                variant={
                  resultMatch === "exact"
                    ? "correct"
                    : resultMatch === "close"
                      ? "close"
                      : "wrong"
                }
                correctAnswer={current.acceptedAnswers[0] ?? ""}
                meta={`${current.songTitle} — ${current.album} · ${current.year}`}
                pointsEarned={resultPoints}
              />
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-(--accent) px-5 py-3 font-semibold text-white hover:bg-(--accent-soft)"
              >
                Next →
              </button>
            </>
          )}
        </>
      )}

      {phase === "summary" && (
        <GameSummary
          score={score}
          highScore={highScore}
          isNewHigh={isNewHigh}
          bestStreak={bestStreakState}
          isNewBestStreak={isNewBestStreak}
          rounds={roundIndex}
          correct={correctCount}
          onPlayAgain={() => setPhase("start")}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function StartScreen({
  difficulty,
  setDifficulty,
  sessionLength,
  setSessionLength,
  highScore,
  bestStreak,
  onStart,
}: {
  difficulty: Difficulty | "all";
  setDifficulty: (d: Difficulty | "all") => void;
  sessionLength: SessionLength;
  setSessionLength: (l: SessionLength) => void;
  highScore: number;
  bestStreak: number;
  onStart: () => void;
}) {
  const placeholder = LYRICS.some((l) => l.songTitle.startsWith("REPLACE"));
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Finish the Bar
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          We give you the start of an Eminem bar — you type what comes next.
          Hints available, but they cost points.
        </p>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Difficulty
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={
                difficulty === d
                  ? "rounded-full bg-(--accent) px-4 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full border border-(--border) bg-(--surface-2) px-4 py-1.5 text-sm text-(--muted) hover:border-(--accent-soft) hover:text-foreground"
              }
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
          Rounds
        </div>
        <div className="flex flex-wrap gap-2">
          {([5, 10, "endless"] as SessionLength[]).map((s) => (
            <button
              key={String(s)}
              type="button"
              onClick={() => setSessionLength(s)}
              className={
                sessionLength === s
                  ? "rounded-full bg-(--accent) px-4 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full border border-(--border) bg-(--surface-2) px-4 py-1.5 text-sm text-(--muted) hover:border-(--accent-soft) hover:text-foreground"
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-(--surface-2) p-3 text-center text-sm">
        <div>
          <div className="font-mono text-xl font-bold">{highScore}</div>
          <div className="text-[10px] uppercase tracking-wider text-(--muted)">
            high score
          </div>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{bestStreak}</div>
          <div className="text-[10px] uppercase tracking-wider text-(--muted)">
            best streak
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg bg-(--accent) px-5 py-3 font-semibold text-white hover:bg-(--accent-soft)"
      >
        Start
      </button>
      {placeholder && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠ This game ships with placeholder lyric prompts. Edit{" "}
          <code>src/lib/games/lyrics.ts</code> to add real ones.
        </div>
      )}
    </div>
  );
}

function PromptCard({
  promptText,
  hintsUsed,
  answerForHint,
  customHint,
}: {
  promptText: string;
  hintsUsed: number;
  answerForHint: string;
  customHint?: string;
}) {
  // Hint 1: word count + char count. Hint 2: first letter of each word
  // (or custom hint if author provided one for that level).
  const words = answerForHint.trim().split(/\s+/).filter(Boolean);
  const firstLetters = words
    .map((w) => (w[0] ? w[0].toUpperCase() + (w.length > 1 ? "_".repeat(w.length - 1) : "") : ""))
    .join(" ");

  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) p-5 sm:p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
        finish this bar
      </div>
      <div className="mt-2 text-lg font-semibold leading-relaxed sm:text-xl">
        {promptText}
        <span className="ml-2 inline-block animate-pulse text-(--accent-soft)">
          ___
        </span>
      </div>
      {hintsUsed >= 1 && (
        <div className="mt-3 rounded-lg border border-(--border) bg-(--surface-2) p-3 text-xs">
          <span className="font-semibold uppercase tracking-wider text-(--accent-soft)">
            hint 1
          </span>
          <span className="ml-2 text-(--muted)">
            {words.length} word{words.length === 1 ? "" : "s"},{" "}
            {answerForHint.length} chars
          </span>
        </div>
      )}
      {hintsUsed >= 2 && (
        <div className="mt-2 rounded-lg border border-(--border) bg-(--surface-2) p-3 text-xs">
          <span className="font-semibold uppercase tracking-wider text-(--accent-soft)">
            hint 2
          </span>
          <span className="ml-2 font-mono text-foreground">
            {customHint ?? firstLetters}
          </span>
        </div>
      )}
    </div>
  );
}

function AnswerForm({
  value,
  onChange,
  onSubmit,
  onHint,
  hintsUsed,
  hasCustomHint,
  inputRef,
}: {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  onHint: () => void;
  hintsUsed: number;
  hasCustomHint: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const submittedRef = useRef(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit();
    setTimeout(() => {
      submittedRef.current = false;
    }, 500);
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="type your answer…"
        aria-label="Type the rest of the bar"
        className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-base outline-none focus:border-(--accent) placeholder:text-(--muted)"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!value.trim()}
          className="flex-1 rounded-lg bg-(--accent) px-4 py-3 font-semibold text-white hover:bg-(--accent-soft) disabled:opacity-50"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={hintsUsed >= 2}
          className="rounded-lg border border-(--border) bg-(--surface-2) px-4 py-3 text-sm font-medium text-(--muted) hover:border-(--accent-soft) hover:text-foreground disabled:opacity-50"
        >
          {hintsUsed === 0
            ? "Hint (-25)"
            : hintsUsed === 1
              ? hasCustomHint
                ? "Hint 2 (-25)"
                : "Hint 2 (-25)"
              : "no hints left"}
        </button>
      </div>
    </form>
  );
}
