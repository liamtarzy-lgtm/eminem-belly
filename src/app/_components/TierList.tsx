import type { RankedSong } from "@/lib/ranking/queries";
import { withDisplayRanks } from "@/lib/ranking/queries";
import { rankToScore } from "@/lib/score";
import { SongImage } from "./SongImage";
import { PlayPreview } from "./PlayPreview";

const TIERS = [
  { letter: "S", min: 9, label: "Untouchable", color: "#facc15", text: "text-amber-300" },
  { letter: "A", min: 7.5, label: "Heat", color: "#fb923c", text: "text-orange-400" },
  { letter: "B", min: 6, label: "Solid", color: "#dc2626", text: "text-red-500" },
  { letter: "C", min: 4.5, label: "OK", color: "#a3a3a3", text: "text-zinc-400" },
  { letter: "D", min: 3, label: "Skip", color: "#525252", text: "text-zinc-500" },
  { letter: "F", min: 0, label: "Mid", color: "#404040", text: "text-zinc-600" },
] as const;

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
  // Sort songs into tiers
  const buckets = TIERS.map(() => [] as typeof withRanks);
  for (const r of withRanks) {
    const score = rankToScore(r.displayRank, total);
    const idx = TIERS.findIndex((t) => score >= t.min);
    if (idx >= 0) buckets[idx].push(r);
  }
  const visibleTiers = TIERS.map((t, i) => ({ tier: t, songs: buckets[i] })).filter(
    (b) => b.songs.length > 0,
  );

  return (
    <div className="flex flex-col gap-2">
      {visibleTiers.map(({ tier, songs }) => (
        <div
          key={tier.letter}
          className="flex overflow-hidden rounded-xl border border-(--border) bg-(--surface)"
        >
          {/* Tier letter cell on the left */}
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

          {/* Songs in this tier */}
          <div className="flex flex-1 flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-3">
            {songs.map((r) => (
              <div
                key={r.song.id}
                className="group relative flex w-[64px] flex-col items-center sm:w-[80px]"
                title={`${r.song.title} — ${r.song.primaryArtist}`}
              >
                <div className="relative">
                  <SongImage song={r.song} size="sm" />
                  <PlayPreview
                    key={r.song.id}
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
