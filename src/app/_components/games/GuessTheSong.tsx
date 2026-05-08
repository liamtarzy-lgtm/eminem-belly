"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GameSong, CatalogEntry } from "@/lib/games/queries";
import type { SessionLength } from "@/lib/games/types";
import { pickDistractors } from "@/lib/games/distractors";
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
  song: GameSong;
  segment: { start: number; end: number };
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

function buildRound(song: GameSong, catalog: CatalogEntry[]): Round {
  const segment = song.segments[Math.floor(Math.random() * song.segments.length)];
  const distractors = pickDistractors(
    {
      id: song.id,
      album: song.album,
      year: song.year,
      eminemRole: song.eminemRole,
    },
    catalog,
    song.title,
  );
  const choices = shuffle([song.title, ...distractors]);
  return { song, segment, choices, correctIndex: choices.indexOf(song.title) };
}

export function GuessTheSong({
  pool,
  catalog,
}: {
  pool: GameSong[];
  catalog: CatalogEntry[];
}) {
  const [sessionLength, setSessionLength] = useState<SessionLength>(10);
  const [phase, setPhase] = useState<Phase>("start");

  const [usedIds, setUsedIds] = useState<Set<number>>(new Set());
  const [round, setRound] = useState<Round | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScore, setHighScoreState] = useState(0);
  const [bestStreakState, setBestStreakState] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isNewBestStreak, setIsNewBestStreak] = useState(false);

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

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (answerTimerRef.current) clearInterval(answerTimerRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

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

  async function playSegment(r: Round, isReplay = false) {
    setAudioError(null);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/api/preview/${r.song.id}?t=${Date.now()}`;
    setPhase("loading");
    try {
      // Wait until audio can seek
      await new Promise<void>((resolve, reject) => {
        const onCan = () => {
          audio.removeEventListener("canplay", onCan);
          audio.removeEventListener("error", onErr);
          resolve();
        };
        const onErr = () => {
          audio.removeEventListener("canplay", onCan);
          audio.removeEventListener("error", onErr);
          reject(new Error("audio failed to load"));
        };
        audio.addEventListener("canplay", onCan);
        audio.addEventListener("error", onErr);
        audio.load();
      });
      audio.currentTime = r.segment.start;
      await audio.play();
      if (!isReplay) setPhase("playing");
      const duration = (r.segment.end - r.segment.start) * 1000;
      stopTimerRef.current = setTimeout(() => {
        audio.pause();
        if (!isReplay) {
          setPhase("answering");
          startAnswerCountdown();
        }
      }, duration);
    } catch {
      setAudioError(
        "Couldn't load the snippet. Skip this round or try again later.",
      );
      setPhase("answering");
      startAnswerCountdown();
    }
  }

  function startNextRound(currentUsedIds: Set<number>) {
    const remaining = pool.filter((s) => !currentUsedIds.has(s.id));
    if (remaining.length === 0) {
      finishGame();
      return;
    }
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    const newRound = buildRound(next, catalog);
    setRound(newRound);
    setUsedIds(new Set([...currentUsedIds, next.id]));
    setRoundIndex((i) => i + 1);
    setReplayUsed(false);
    setPickedIndex(null);
    setTimedOut(false);
    setResultPoints(0);
    void playSegment(newRound);
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
      songId: round.song.id,
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
    setUsedIds(new Set());
    setRoundIndex(0);
    setCorrectCount(0);
    setScore(0);
    setStreak(0);
    setIsNewHigh(false);
    setIsNewBestStreak(false);
    trackEvent("game_started", {
      gameId: GAME_ID,
      sessionLength: String(sessionLength),
      poolSize: pool.length,
    });
    startNextRound(new Set());
  }

  function handleNext() {
    if (sessionLength !== "endless" && roundIndex >= sessionLength) {
      finishGame();
      return;
    }
    startNextRound(usedIds);
  }

  function handleReplay() {
    if (!round || replayUsed) return;
    setReplayUsed(true);
    trackEvent("replay_used", { gameId: GAME_ID, songId: round.song.id });
    void playSegment(round, true);
  }

  // ── Pool gate ───────────────────────────────────────────────────────
  if (pool.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-100 sm:p-8">
        <div className="text-2xl font-bold tracking-tight">
          No validated rap snippets available yet.
        </div>
        <p className="text-sm">
          The Guess-the-Song game only plays from windows that have been
          manually validated as Eminem actively rapping. Once you mark
          some, the game pool fills automatically.
        </p>
        <Link
          href="/admin/segments"
          className="self-start rounded-lg bg-(--accent) px-5 py-2.5 font-semibold text-white hover:bg-(--accent-soft)"
        >
          Open the segment editor →
        </Link>
        <div className="text-xs text-amber-200/70">
          (Admin only — visible to your account.)
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} preload="metadata" />

      {phase === "start" && (
        <StartScreen
          poolSize={pool.length}
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
              audioError={audioError}
              timeLeft={timeLeft}
              replayUsed={replayUsed}
              onReplay={handleReplay}
              segmentLength={round.segment.end - round.segment.start}
            />

            <ChoiceGrid
              choices={round.choices}
              correctIndex={round.correctIndex}
              pickedIndex={pickedIndex}
              disabled={phase !== "answering"}
              onPick={(i) => finalizeRound(i)}
            />

            {phase === "result" && (
              <>
                <AnswerFeedback
                  variant={
                    pickedIndex !== null && pickedIndex === round.correctIndex
                      ? "correct"
                      : timedOut
                        ? "timeout"
                        : "wrong"
                  }
                  correctAnswer={round.song.title}
                  meta={[round.song.album, round.song.year]
                    .filter(Boolean)
                    .join(" · ")}
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

// ── Sub-components ────────────────────────────────────────────────────

function StartScreen({
  poolSize,
  sessionLength,
  setSessionLength,
  highScore,
  bestStreak,
  onStart,
}: {
  poolSize: number;
  sessionLength: SessionLength;
  setSessionLength: (l: SessionLength) => void;
  highScore: number;
  bestStreak: number;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Guess the Song in 2 Seconds
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          Two seconds of Eminem rapping. Pick the song from four similar
          choices. Faster + longer streaks = higher score.
        </p>
        <p className="mt-2 text-xs text-(--muted)">
          {poolSize} song{poolSize === 1 ? "" : "s"} in the pool.
        </p>
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
    </div>
  );
}

function SnippetPad({
  phase,
  audioError,
  timeLeft,
  replayUsed,
  onReplay,
  segmentLength,
}: {
  phase: Phase;
  audioError: string | null;
  timeLeft: number;
  replayUsed: boolean;
  onReplay: () => void;
  segmentLength: number;
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
                  ? `listening… ${segmentLength.toFixed(1)}s`
                  : phase === "answering"
                    ? "answer below"
                    : "result"}
            </div>
            <div className="text-xs text-(--muted)">
              {phase === "answering"
                ? `${(timeLeft / 1000).toFixed(1)}s to answer`
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
