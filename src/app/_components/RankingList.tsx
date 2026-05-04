import { rankToScore } from "@/lib/score";
import { recompareForm } from "@/lib/ranking/actions";
import { withDisplayRanks, type RankedSong } from "@/lib/ranking/queries";
import { SongImage } from "./SongImage";
import { Score } from "./ScoreBadge";
import { PlayPreview } from "./PlayPreview";
import { SaveButton } from "./SaveButton";

export function RankingList({
  items,
  savedIds,
}: {
  items: RankedSong[];
  savedIds: Set<number>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-8 text-center">
        <div className="text-sm text-(--muted)">
          Nothing here yet. Tap{" "}
          <span className="text-foreground font-medium">rank</span> in the header to start.
        </div>
      </div>
    );
  }
  const total = items.length;
  const withRanks = withDisplayRanks(items);
  return (
    <ol className="flex flex-col gap-1.5">
      {withRanks.map(({ position, displayRank, song, tiedWithSongId }, idx) => {
        const score = rankToScore(displayRank, total);
        const isTiedWithPrev =
          idx > 0 && withRanks[idx - 1].displayRank === displayRank;
        const isTiedWithNext =
          idx < withRanks.length - 1 &&
          withRanks[idx + 1].displayRank === displayRank;
        const isInTie = isTiedWithPrev || isTiedWithNext;
        return (
          <li
            key={song.id}
            className="group flex items-center gap-3 rounded-xl border border-transparent bg-(--surface) p-2.5 transition hover:border-(--border) hover:bg-(--surface-2) sm:gap-4 sm:p-3"
          >
            <div className="w-9 shrink-0 text-right font-mono text-sm text-(--muted) sm:w-11 sm:text-base">
              {isTiedWithPrev ? (
                <span className="text-(--accent-soft)">=</span>
              ) : isInTie ? (
                <span className="text-(--accent-soft)">T-{displayRank}</span>
              ) : (
                displayRank
              )}
            </div>
            <div className="relative shrink-0">
              <SongImage song={song} size="sm" />
              <PlayPreview
                key={song.id}
                songId={song.id}
                hasPreview={!!song.previewUrl}
                title={song.title}
                artist={song.primaryArtist}
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
            <div className="flex shrink-0 items-center gap-1">
              <SaveButton
                songId={song.id}
                initialSaved={savedIds.has(song.id)}
                size="sm"
              />
              <form action={recompareForm}>
                <input type="hidden" name="songId" value={song.id} />
                <button
                  type="submit"
                  aria-label="re-rank"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-(--muted) transition hover:border-(--accent) hover:text-foreground"
                >
                  ↺
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
