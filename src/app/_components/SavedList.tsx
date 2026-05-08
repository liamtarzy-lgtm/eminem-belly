import type { SavedSongRow } from "@/lib/ranking/queries";
import { SongImage } from "./SongImage";
import { PlayPreview } from "./PlayPreview";
import { SaveButton } from "./SaveButton";
import { AppleMusicLink } from "./AppleMusicLink";

export function SavedList({ items }: { items: SavedSongRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-8 text-center">
        <div className="text-sm text-(--muted)">
          Tap the <span className="text-foreground font-medium">+</span> button on any song to save it for later.
        </div>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map(({ song }) => (
        <li
          key={song.id}
          className="group flex items-center gap-3 rounded-xl border border-transparent bg-(--surface) p-2.5 transition hover:border-(--border) hover:bg-(--surface-2) sm:gap-4 sm:p-3"
        >
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
              {song.album && (
                <span className="ml-2 text-(--muted)/70">· {song.album}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <AppleMusicLink title={song.title} artist={song.primaryArtist} />
            <SaveButton songId={song.id} initialSaved size="sm" />
          </div>
        </li>
      ))}
    </ol>
  );
}
