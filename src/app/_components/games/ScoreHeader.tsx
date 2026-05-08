export function ScoreHeader({
  score,
  highScore,
  streak,
  bestStreak,
  round,
  totalRounds,
}: {
  score: number;
  highScore: number;
  streak: number;
  bestStreak: number;
  round: number;
  totalRounds: number | "endless";
}) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-xl border border-(--border) bg-(--surface) p-3 sm:gap-3 sm:p-4">
      <Stat label="score" value={score.toString()} />
      <Stat
        label="round"
        value={
          totalRounds === "endless" ? `${round}` : `${round}/${totalRounds}`
        }
      />
      <Stat
        label="streak"
        value={`${streak}${streak > 0 ? "🔥" : ""}`}
        sub={bestStreak > 0 ? `best ${bestStreak}` : undefined}
      />
      <Stat
        label="best"
        value={highScore.toString()}
        accent={score > 0 && score >= highScore}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div
        className={`font-mono text-lg font-bold tabular-nums sm:text-xl ${accent ? "text-(--accent-soft)" : ""}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-(--muted)">
        {label}
      </div>
      {sub && <div className="text-[9px] text-(--muted)/80">{sub}</div>}
    </div>
  );
}
