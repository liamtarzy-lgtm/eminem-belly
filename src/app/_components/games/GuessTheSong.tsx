"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty, SessionLength, Snippet } from "@/lib/games/types";
import { SNIPPETS } from "@/lib/games/snippets";
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

const GAME_ID = "guess-the-song";
const ANSWER_TIMEOUT_MS = 7000;

type Phase = "start" | "loading" | "playing" | "answering" | "result" | "summary";

type Round = {
  snippet: Snippet;
  /** [correctTitle, wrongA, wrongB, wrongC] in randomized display order. */
  choices: string[];
  correctIndex: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(snippet: Snippet): Round {
  const correct = snippet.songTitle;
  const wrongs = snippet.similarWrongChoices;
  const choices = shuffle([correct, ...wrongs]);
  return { snippet, choices, correctIndex: choices.indexOf(correct) };
}

function pickPool(difficulty: Difficulty | "all"): Snippet[] {
  if (difficulty === "all") return SNIPPETS;
  return SNIPPETS.filter((s) => s.difficulty === difficulty);
}

export function GuessTheSong() {
  // ── Setup state ─────────────────────────────────────────────────────
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [sessionLength, setSessionLength] = useState<SessionLength>(10);
  const [phase, setPhase] = useState<Phase>("start");

  // ── In-game state ───────────────────────────────────────────────────
  const [pool, setPool] = useState<Snippet[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [round, setRound] = useState<Round | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScore, setHighScoreState] = useState(0);
  const [bestStreakState, setBestStreakState] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isNewBestStreak, setIsNewBestStreak] = useState(false);

  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [replayUsed, setReplayUsed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ANSWER_TIMEOUT_MS);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [resultPoints, setResultPoints] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHighScoreState(getHighScore(GAME_ID));
    setBestStreakState(getBestStreak(GAME_ID));
  }, []);

  // ── Audio control ───────────────────────────────────────────────────
  function clearTimers() {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    stopTimerRef.current = null;
    answerTimerRef.current = null;
  }

  function startAnswerCountdown() {
    setTimeLeft(ANSWER_TIMEOUT_MS);
    const startedAt = Date.now();
    answerTimerRef.current = setInterval(() => {
      const remaining = ANSWER_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        clearTimers();
        setTimeLeft(0);
        finalizeRound(null, true);
      } else {
        setTimeLeft(remaining);
      }
    }, 100);
  }

  async function playSnippet(snippet: Snippet, isReplay = false) {
    setAudioError(null);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = snippet.audioSrc;
    audio.currentTime = snippet.startTimeSeconds ?? 0;
    setAudioReady(false);
    try {
      await audio.play();
      setAudioReady(true);
      if (!isReplay) setPhase("playing");
      // Auto-stop after the snippet duration
      const dur = (snippet.durationSeconds ?? 2) * 1000;
      stopTimerRef.current = setTimeout(() => {
        audio.pause();
        // After snippet ends, give user the answer window
        if (!isReplay) {
          setPhase("answering");
          startAnswerCountdown();
        }
      }, dur);
    } catch {
      setAudioError(
        "Couldn't load the audio clip. The file at " +
          snippet.audioSrc +
          " is missing or your browser blocked playback. Replace placeholder audio in /public/audio/eminem/ to enable this round.",
      );
      // Fall through to the answer phase anyway so the user can move on
      setPhase("answering");
      startAnswerCountdown();
    }
  }

  function startNextRound(currentPool: Snippet[], currentUsedIds: Set<string>) {
    const remaining = currentPool.filter((s) => !currentUsedIds.has(s.id));
    if (remaining.length === 0) {
      // Out of unique snippets — end the session
      finishGame();
      return;
    }
    const snippet = remaining[Math.floor(Math.random() * remaining.length)];
    const newRound = buildRound(snippet);
    setRound(newRound);
    setUsedIds(new Set([...currentUsedIds, snippet.id]));
    setRoundIndex((i) => i + 1);
    setReplayUsed(false);
    setPickedIndex(null);
    setTimedOut(false);
    setResultPoints(0);
    setPhase("loading");
    void playSnippet(snippet);
  }

  function finalizeRound(choiceIndex: number | null, didTimeOut = false) {
    clearTimers();
    if (!round) return;
    const isCorrect = choiceIndex !== null && choiceIndex === round.correctIndex;
    const newStreak = isCorrect ? streak + 1 : 0;
    const points = computeRoundScore({
      base: isCorrect ? 100 : 0,
      replayUsed,
      streakAfter: newStreak,
    });
    setStreak(newStreak);
    setScore((s) => s + points);
    if (isCorrect) setCorrectCount((c) => c + 1);
    setPickedIndex(choiceIndex);
    setResultPoints(points);
    setTimedOut(didTimeOut);
    setPhase("result");
    trackEvent("question_answered", {
      gameId: GAME_ID,
      snippetId: round.snippet.id,
      correct: isCorrect,
      timedOut: didTimeOut,
      replayUsed,
      streakAfter: newStreak,
    });
  }

  function finishGame() {
    clearTimers();
    if (audioRef.current) audioRef.current.pause();
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
    if (filtered.length === 0) {
      setAudioError("No snippets available for that difficulty.");
      return;
    }
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

  function handleReplay() {
    if (!round || replayUsed) return;
    setReplayUsed(true);
    trackEvent("replay_used", { gameId: GAME_ID, snippetId: round.snippet.id });
    void playSnippet(round.snippet, true);
  }

  useEffect(() => {
    return () => {
      clearTimers();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} preload="metadata" />

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

      {(phase === "loading" ||
        phase === "playing" ||
        phase === "answering" ||
        phase === "result") &&
        round && (
          <>
            <ScoreHeader
              score={score}
              highScore={highScore}
              streak={streak}
              bestStreak={bestStreakState}
              round={roundIndex}
              totalRounds={sessionLength}
            />

            <SnippetPad
              phase={phase}
              audioReady={audioReady}
              audioError={audioError}
              timeLeft={timeLeft}
              replayUsed={replayUsed}
              onReplay={handleReplay}
            />

            <ChoiceGrid
              choices={round.choices}
              correctIndex={round.correctIndex}
              pickedIndex={pickedIndex}
              disabled={phase !== "answering"}
              onPick={(i) => finalizeRound(i)}
            />

            {phase === "result" && (
              <AnswerFeedback
                variant={
                  pickedIndex !== null && pickedIndex === round.correctIndex
                    ? "correct"
                    : timedOut
                      ? "timeout"
                      : "wrong"
                }
                correctAnswer={round.snippet.songTitle}
                meta={`${round.snippet.album} · ${round.snippet.year}`}
                funFact={round.snippet.funFact}
                pointsEarned={resultPoints}
              />
            )}

            {phase === "result" && (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-(--accent) px-5 py-3 font-semibold text-white hover:bg-(--accent-soft)"
              >
                Next →
              </button>
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
  const placeholderHint = SNIPPETS.some((s) =>
    s.songTitle.startsWith("REPLACE"),
  );
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Guess the Song in 2 Seconds
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          A 2-second clip of Eminem rapping. Pick the song from four choices.
          Faster answers and longer streaks score higher.
        </p>
      </div>

      <ChooserRow label="Difficulty">
        {(["all", "easy", "medium", "hard"] as const).map((d) => (
          <ChoiceChip
            key={d}
            active={difficulty === d}
            onClick={() => setDifficulty(d)}
          >
            {d}
          </ChoiceChip>
        ))}
      </ChooserRow>

      <ChooserRow label="Rounds">
        {([5, 10, "endless"] as SessionLength[]).map((s) => (
          <ChoiceChip
            key={String(s)}
            active={sessionLength === s}
            onClick={() => setSessionLength(s)}
          >
            {s}
          </ChoiceChip>
        ))}
      </ChooserRow>

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

      {placeholderHint && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠ This game ships with placeholder rounds. Add your own audio
          snippets to <code>public/audio/eminem/</code> and edit{" "}
          <code>src/lib/games/snippets.ts</code> to play with real questions.
        </div>
      )}
    </div>
  );
}

function ChooserRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-(--accent) px-4 py-1.5 text-sm font-semibold text-white"
          : "rounded-full border border-(--border) bg-(--surface-2) px-4 py-1.5 text-sm text-(--muted) hover:border-(--accent-soft) hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function SnippetPad({
  phase,
  audioReady,
  audioError,
  timeLeft,
  replayUsed,
  onReplay,
}: {
  phase: Phase;
  audioReady: boolean;
  audioError: string | null;
  timeLeft: number;
  replayUsed: boolean;
  onReplay: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (timeLeft / 7000) * 100));
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-(--accent)/15 text-lg ${
              phase === "playing" ? "animate-pulse" : ""
            }`}
          >
            ♫
          </div>
          <div>
            <div className="text-sm font-semibold">
              {phase === "loading"
                ? "loading clip…"
                : phase === "playing"
                  ? "listening… 2 sec"
                  : phase === "answering"
                    ? "answer below"
                    : "result"}
            </div>
            <div className="text-xs text-(--muted)">
              {phase === "answering"
                ? `${(timeLeft / 1000).toFixed(1)}s to answer`
                : audioReady
                  ? "snippet played"
                  : "preparing audio"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onReplay}
          disabled={
            phase !== "answering" || replayUsed || audioError !== null
          }
          aria-label="Replay snippet (one-time, costs 25 pts)"
          className="rounded-md border border-(--border) bg-(--surface-2) px-3 py-1.5 text-xs hover:border-(--accent-soft) disabled:opacity-50"
        >
          {replayUsed ? "↻ replayed (-25)" : "↻ replay"}
        </button>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-(--surface-2)">
        <div
          className={`h-full transition-all ${
            phase === "answering" ? "bg-(--accent-soft)" : "bg-(--accent)"
          }`}
          style={{
            width: `${phase === "answering" ? pct : phase === "playing" ? 100 : 0}%`,
          }}
        />
      </div>

      {audioError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
        >
          {audioError}
        </div>
      )}
    </div>
  );
}

function ChoiceGrid({
  choices,
  correctIndex,
  pickedIndex,
  disabled,
  onPick,
}: {
  choices: string[];
  correctIndex: number;
  pickedIndex: number | null;
  disabled: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
      {choices.map((c, i) => {
        const reveal = pickedIndex !== null;
        const isCorrect = i === correctIndex;
        const isPicked = i === pickedIndex;
        let style =
          "border-(--border) bg-(--surface) hover:border-(--accent) hover:bg-(--surface-2)";
        if (reveal && isCorrect) {
          style = "border-emerald-500 bg-emerald-500/15 text-emerald-300";
        } else if (reveal && isPicked) {
          style = "border-rose-500 bg-rose-500/15 text-rose-300";
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            disabled={disabled}
            aria-label={`Choose ${c}`}
            className={`min-h-[60px] rounded-xl border p-3 text-left text-sm font-medium transition disabled:cursor-default ${style}`}
          >
            <span className="mr-2 inline-block w-5 font-mono text-(--muted)">
              {String.fromCharCode(65 + i)}
            </span>
            {c}
            {reveal && isCorrect && (
              <span aria-hidden className="ml-2 text-emerald-400">
                ✓
              </span>
            )}
            {reveal && isPicked && !isCorrect && (
              <span aria-hidden className="ml-2 text-rose-400">
                ✕
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
