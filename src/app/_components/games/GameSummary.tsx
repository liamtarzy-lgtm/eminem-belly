import Link from "next/link";

export function GameSummary({
  score,
  highScore,
  isNewHigh,
  bestStreak,
  isNewBestStreak,
  rounds,
  correct,
  onPlayAgain,
}: {
  score: number;
  highScore: number;
  isNewHigh: boolean;
  bestStreak: number;
  isNewBestStreak: boolean;
  rounds: number;
  correct: number;
  onPlayAgain: () => void;
}) {
  const accuracy = rounds > 0 ? Math.round((correct / rounds) * 100) : 0;
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-(--border) bg-(--surface) p-6 text-center sm:p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
          game over
        </div>
        <div className="mt-2 font-mono text-5xl font-bold tabular-nums sm:text-6xl">
          {score}
        </div>
        {isNewHigh && (
          <div className="mt-2 text-sm font-semibold text-(--accent-soft)">
            🔥 new high score
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-(--border)/60 pt-4 text-sm">
        <Stat label="rounds" value={`${rounds}`} />
        <Stat label="correct" value={`${correct}`} sub={`${accuracy}%`} />
        <Stat
          label="best streak"
          value={`${bestStreak}`}
          sub={isNewBestStreak ? "new best" : undefined}
        />
      </div>

      <div className="text-xs text-(--muted)">
        previous high score: {highScore}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-(--accent) px-4 py-3 font-semibold text-white hover:bg-(--accent-soft)"
        >
          Play again
        </button>
        <Link
          href="/games"
          className="flex-1 rounded-lg border border-(--border) bg-(--surface-2) px-4 py-3 text-center font-semibold text-(--muted) hover:text-foreground"
        >
          Other games
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="font-mono text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-(--muted)">
        {label}
      </div>
      {sub && <div className="text-[9px] text-(--accent-soft)">{sub}</div>}
    </div>
  );
}
