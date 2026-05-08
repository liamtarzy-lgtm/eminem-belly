import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// Returns a 30-sec audio preview for a song.
//
// Two sources, in order of preference:
//   1. Deezer — URLs expire (signed), so we re-fetch a fresh URL at play
//      time using the cached deezer_track_id.
//   2. iTunes — URLs are stable, so we just redirect to the stored
//      previewUrl directly.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { songId } = await params;
  const id = Number(songId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const song = await db
    .select({
      deezerTrackId: schema.songs.deezerTrackId,
      previewUrl: schema.songs.previewUrl,
    })
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .get();
  if (!song) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Prefer Deezer when available (fresh signed URLs)
  if (song.deezerTrackId) {
    try {
      const res = await fetch(
        `https://api.deezer.com/track/${song.deezerTrackId}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const track = (await res.json()) as { preview?: string };
        if (track.preview) {
          return NextResponse.redirect(track.preview, 302);
        }
      }
    } catch {
      // fall through to stored URL
    }
  }

  // Fallback: stored previewUrl (e.g. iTunes for ShadyXV exclusives — stable)
  if (song.previewUrl) {
    return NextResponse.redirect(song.previewUrl, 302);
  }

  return NextResponse.json({ error: "no preview available" }, { status: 404 });
}
