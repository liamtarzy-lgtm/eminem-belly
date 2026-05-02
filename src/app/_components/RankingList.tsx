import type { RankedSong } from "@/lib/ranking/queries";
import { rankToScore } from "@/lib/score";
import { recompareForm } from "@/lib/ranking/actions";
import { SongImage } from "./SongImage";
import { Score } from "./ScoreBadge";
import { PlayPreview } from "./PlayPreview";

export function RankingList({
  items,
  startAtPosition = 1,
}: {
  items: RankedSong[];
  startAtPosition?: number;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-8 text-center">
        <div className="text-sm text-(--muted)">
          Nothing here yet. Tap <span className="text-foreground font-medium">rank</span> in the header to start.
        </div>
      </div>
    );
  }
  const total = items.length + (startAtPosition - 1);
  const visible = items.filter((r) => r.position >= startAtPosition);
  return (
    <ol className="flex flex-col gap-1.5">
      {visible.map(({ position, song }) => {
        const score = rankToScore(position, total);
        return (
          <li
            key={song.id}
            className="group flex items-center gap-3 rounded-xl border border-transparent bg-(--surface) p-2.5 transition hover:border-(--border) hover:bg-(--surface-2) sm:gap-4 sm:p-3"
          >
            <div className="w-7 shrink-0 text-right font-mono text-sm text-(--muted) sm:w-9 sm:text-base">
              {position}
            </div>
            <div className="relative shrink-0">
              <SongImage song={song} size="sm" />
              <PlayPreview
                songId={song.id}
                hasPreview={!!song.previewUrl}
                size="sm"
                className="absolute inset-0 m-auto"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium sm:text-base">
                {song.title}
              </div>
              <div className="truncate text-xs text-(--muted)">
                {song.primaryArtist}
                {song.eminemRole === "feature" && (
                  <span className="ml-2 inline-block rounded bg-(--surface-2) px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-(--accent-soft)">
                    feat.
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 pr-1">
              <Score score={score} size="md" />
            </div>
            <form action={recompareForm} className="shrink-0">
              <input type="hidden" name="songId" value={song.id} />
              <button
                type="submit"
                aria-label="re-rank"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-(--muted) transition hover:border-(--accent) hover:text-foreground"
              >
                ↺
              </button>
            </form>
          </li>
        );
      })}
    </ol>
  );
}
