import type { RankedSong } from "@/lib/ranking/queries";
import { rankToScore } from "@/lib/score";
import { SongImage } from "./SongImage";
import { Score } from "./ScoreBadge";

const ORDER: { pos: number; lift: string; medal: string; ring: string }[] = [
  { pos: 2, lift: "pt-6 sm:pt-10", medal: "text-zinc-300", ring: "ring-zinc-500/30" },
  { pos: 1, lift: "pt-0", medal: "text-amber-300", ring: "ring-amber-400/40" },
  { pos: 3, lift: "pt-10 sm:pt-14", medal: "text-amber-700", ring: "ring-amber-700/40" },
];

export function TopThreePodium({ items }: { items: RankedSong[] }) {
  const total = items.length;
  if (total < 3) return null;
  const top3 = items.slice(0, 3);
  const byPos = new Map(top3.map((r) => [r.position, r]));

  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) p-4 sm:p-6">
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
        your top 3
      </div>
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-6">
        {ORDER.map(({ pos, lift, medal, ring }) => {
          const r = byPos.get(pos);
          if (!r) return <div key={pos} />;
          const score = rankToScore(r.position, total);
          return (
            <div
              key={pos}
              className={`flex flex-col items-center gap-2 ${lift}`}
            >
              <div className={`relative rounded-xl ring-2 ${ring}`}>
                <SongImage song={r.song} size="md" />
                <div
                  className={`absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-(--background) text-sm font-bold ring-2 ring-(--surface) ${medal}`}
                >
                  {pos}
                </div>
              </div>
              <div className="w-full text-center">
                <div className="line-clamp-1 text-xs font-semibold sm:text-sm">
                  {r.song.title}
                </div>
                <div className="line-clamp-1 text-[10px] text-(--muted) sm:text-xs">
                  {r.song.primaryArtist}
                </div>
              </div>
              <Score score={score} size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
