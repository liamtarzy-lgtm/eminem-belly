import type { RankedSong } from "@/lib/ranking/queries";
import { withDisplayRanks } from "@/lib/ranking/queries";
import { SongImage } from "./SongImage";
import { PlayPreview } from "./PlayPreview";

// Percentile-based tiers — S always populates regardless of how many songs
// the user has ranked. Lower bound is INCLUSIVE (i.e. percentile >= S.min).
const TIERS = [
  { letter: "S", minPct: 0.0, maxPct: 0.1, label: "Untouchable", color: "#facc15" },
  { letter: "A", minPct: 0.1, maxPct: 0.25, label: "Heat", color: "#fb923c" },
  { letter: "B", minPct: 0.25, maxPct: 0.5, label: "Solid", color: "#dc2626" },
  { letter: "C", minPct: 0.5, maxPct: 0.75, label: "OK", color: "#a3a3a3" },
  { letter: "D", minPct: 0.75, maxPct: 0.9, label: "Skip", color: "#525252" },
  { letter: "F", minPct: 0.9, maxPct: 1.01, label: "Mid", color: "#404040" },
] as const;

function tierIndexFor(displayRank: number, total: number): number {
  if (total <= 0) return -1;
  const pct = (displayRank - 1) / total;
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    if (pct >= t.minPct && pct < t.maxPct) return i;
  }
  return TIERS.length - 1;
}

export function TierList({ items }: { items: RankedSong[] }) {
  if (items.length < 3) {
    return (
      <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-8 text-center">
        <div className="text-sm text-(--muted)">
          Rank a few more songs to see your tier list.
        </div>
      </div>
    );
  }
  const total = items.length;
  const withRanks = withDisplayRanks(items);
  const buckets: typeof withRanks[] = TIERS.map(() => []);
  for (const r of withRanks) {
    const idx = tierIndexFor(r.displayRank, total);
    if (idx >= 0) buckets[idx].push(r);
  }

  return (
    <div className="flex flex-col gap-2">
      {TIERS.map((tier, i) => {
        const songs = buckets[i];
        return (
          <div
            key={tier.letter}
            className="flex overflow-hidden rounded-xl border border-(--border) bg-(--surface)"
          >
            <div
              className="flex min-w-[64px] flex-col items-center justify-center px-2 py-3 sm:min-w-[88px]"
              style={{ backgroundColor: tier.color, color: "#0a0a0a" }}
            >
              <div className="text-3xl font-black leading-none sm:text-4xl">
                {tier.letter}
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">
                {tier.label}
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-3">
              {songs.length === 0 ? (
                <div className="px-2 text-xs text-(--muted)">
                  no songs in this tier yet
                </div>
              ) : (
                songs.map((r) => (
                  <div
                    key={r.song.id}
                    className="group relative flex w-[64px] flex-col items-center sm:w-[80px]"
                    title={`${r.song.title} — ${r.song.primaryArtist}`}
                  >
                    <div className="relative">
                      <SongImage song={r.song} size="sm" />
                      <PlayPreview
                        key={`play-${r.song.id}`}
                        songId={r.song.id}
                        hasPreview={!!r.song.previewUrl}
                        title={r.song.title}
                        artist={r.song.primaryArtist}
                        size="sm"
                        className="absolute inset-0 m-auto opacity-0 transition group-hover:opacity-100"
                      />
                    </div>
                    <div className="mt-1 line-clamp-2 text-center text-[10px] leading-tight text-(--muted)">
                      {r.song.title}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
