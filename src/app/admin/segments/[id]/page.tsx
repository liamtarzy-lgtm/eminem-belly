import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSongForEdit } from "@/lib/games/queries";
import { SongImage } from "@/app/_components/SongImage";
import { SegmentEditor } from "@/app/_components/admin/SegmentEditor";

export const dynamic = "force-dynamic";

export default async function EditSegmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const songId = Number(id);
  if (!Number.isFinite(songId)) notFound();
  const song = await getSongForEdit(songId);
  if (!song) notFound();

  // The proxy endpoint handles fresh Deezer URL fetching for us, just like
  // the rest of the app.
  const audioSrc = `/api/preview/${songId}?t=${Date.now()}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/admin/segments"
        className="text-xs text-(--muted) hover:text-foreground"
      >
        ← all songs
      </Link>

      <div className="flex items-center gap-4 rounded-xl border border-(--border) bg-(--surface) p-4">
        <SongImage song={{ artUrl: song.artUrl, title: song.title }} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
            editing segments
          </div>
          <div className="truncate text-xl font-bold sm:text-2xl">
            {song.title}
          </div>
          <div className="truncate text-sm text-(--muted)">
            {song.primaryArtist}
            {song.album && <span> · {song.album}</span>}
          </div>
        </div>
      </div>

      {song.previewUrl || song.deezerTrackId ? (
        <SegmentEditor
          songId={songId}
          audioSrc={audioSrc}
          segments={song.segments}
        />
      ) : (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          This song has no preview audio in the catalog — can&apos;t mark a
          segment without something to listen to. Run{" "}
          <code>npm run enrich</code> to try fetching a preview.
        </div>
      )}

      <div className="rounded-xl border border-(--border) bg-(--surface) p-4 text-xs leading-relaxed text-(--muted)">
        <div className="font-semibold uppercase tracking-wider text-foreground">
          how to mark a segment
        </div>
        <ol className="ml-4 mt-1 list-decimal">
          <li>Tap <span className="text-foreground">play full preview</span> to scrub.</li>
          <li>
            When you hit a moment where Eminem is actually rapping (not a
            hook, intro, or featured artist), tap{" "}
            <span className="text-foreground">set ⇡</span> on the start
            field.
          </li>
          <li>
            The end auto-fills 2 seconds later. Adjust with the −.1 / +.1
            nudge buttons if you want a different window.
          </li>
          <li>
            Tap <span className="text-foreground">play selected</span> to
            audition. Save when it sounds right.
          </li>
        </ol>
      </div>
    </div>
  );
}
