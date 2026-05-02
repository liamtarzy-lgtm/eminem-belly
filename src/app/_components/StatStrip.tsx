import type { RankingStats } from "@/lib/ranking/queries";
import { formatScore } from "@/lib/score";

export function StatStrip({ stats }: { stats: RankingStats }) {
  if (stats.songsRanked === 0) return null;
  const items = [
    { label: "songs", value: stats.songsRanked.toString() },
    { label: "albums", value: stats.albumsCovered.toString() },
    { label: "matchups", value: stats.comparisons.toString() },
    {
      label: "top score",
      value: stats.songsRanked > 0 ? formatScore(stats.topScore) : "—",
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center rounded-xl border border-(--border) bg-(--surface) px-2 py-3 text-center"
        >
          <div className="font-mono text-xl font-bold tabular-nums sm:text-2xl">
            {value}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-(--muted) sm:text-xs">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
