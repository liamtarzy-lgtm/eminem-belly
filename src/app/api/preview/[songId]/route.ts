import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// Resolves a fresh Deezer preview URL for a song and 302-redirects to it.
// Deezer's CDN URLs are signed and expire — re-fetching at play time keeps
// previews working long after the catalog was first enriched.
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
    .select({ deezerTrackId: schema.songs.deezerTrackId })
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .get();
  if (!song?.deezerTrackId) {
    return NextResponse.json({ error: "no preview" }, { status: 404 });
  }

  try {
    const res = await fetch(
      `https://api.deezer.com/track/${song.deezerTrackId}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "deezer failed" }, { status: 502 });
    }
    const track = (await res.json()) as { preview?: string };
    if (!track.preview) {
      return NextResponse.json({ error: "no preview url" }, { status: 404 });
    }
    return NextResponse.redirect(track.preview, 302);
  } catch {
    return NextResponse.json({ error: "deezer unreachable" }, { status: 502 });
  }
}
