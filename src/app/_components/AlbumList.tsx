import type { AlbumRanking } from "@/lib/ranking/queries";
import { SongImage } from "./SongImage";
import { Score } from "./ScoreBadge";

export function AlbumList({ items }: { items: AlbumRanking[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-8 text-center">
        <div className="text-sm text-(--muted)">
          Rank a few Eminem-primary songs and your album averages will show up here.
        </div>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-2">
      {items.map((album, idx) => (
        <li
          key={album.album}
          className="group rounded-xl border border-transparent bg-(--surface) p-3 transition hover:border-(--border) hover:bg-(--surface-2) sm:p-4"
        >
          <details className="group/details">
            <summary className="flex cursor-pointer items-center gap-3 sm:gap-4">
              <div className="w-7 shrink-0 text-right font-mono text-sm text-(--muted) sm:w-9 sm:text-base">
                {idx + 1}
              </div>
              <SongImage song={album.topSong} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold sm:text-base">
                  {album.album}
                </div>
                <div className="text-xs text-(--muted)">
                  {album.songCount} song{album.songCount === 1 ? "" : "s"} ranked
                </div>
              </div>
              <div className="shrink-0 pr-1">
                <Score score={album.avgScore} size="md" />
              </div>
              <div className="text-(--muted) transition group-open/details:rotate-180">
                ⌄
              </div>
            </summary>
            <ul className="mt-3 space-y-1 border-t border-(--border)/50 pt-3 pl-10 sm:pl-12">
              {album.songs.map(({ position, song, score }) => (
                <li
                  key={song.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-7 text-right font-mono text-xs text-(--muted)">
                    #{position}
                  </span>
                  <span className="flex-1 truncate">{song.title}</span>
                  <Score score={score} size="sm" />
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ol>
  );
}
