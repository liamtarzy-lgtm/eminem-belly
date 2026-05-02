import { formatScore, scoreClasses } from "@/lib/score";

type Size = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<Size, string> = {
  sm: "text-sm",
  md: "text-xl sm:text-2xl",
  lg: "text-3xl sm:text-4xl",
  xl: "text-5xl sm:text-6xl",
};

export function Score({
  score,
  size = "md",
  withBar = false,
}: {
  score: number;
  size?: Size;
  withBar?: boolean;
}) {
  const c = scoreClasses(score);
  const pct = Math.max(0, Math.min(100, score * 10));
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={`font-mono font-bold tabular-nums leading-none tracking-tight ${sizeClasses[size]} ${c.text}`}
      >
        {formatScore(score)}
      </div>
      {withBar && (
        <div className="h-1 w-12 overflow-hidden rounded-full bg-(--surface-2)">
          <div
            className={`h-full bg-current ${c.text}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Backwards-compat: keep the old export name as an alias.
export const ScoreBadge = Score;
