import { db, schema } from "@/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";

// Shape passed to the Guess-the-Song game client. Only fields needed
// for gameplay/display.
export type GameSong = {
  id: number;
  title: string;
  album: string | null;
  year: number | null;
  eminemRole: "primary" | "feature";
  segments: Array<{ start: number; end: number }>;
};

// Catalog entry used to generate plausible wrong answers — same album,
// adjacent era, etc. Doesn't include segment data.
export type CatalogEntry = {
  id: number;
  title: string;
  album: string | null;
  year: number | null;
  eminemRole: "primary" | "feature";
};

function yearFromReleaseDate(date: string | null): number | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Songs that are eligible for the Guess-the-Song game: must have at
// least one validated rap segment AND a preview to play.
export async function getGameSongs(): Promise<GameSong[]> {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      album: schema.songs.album,
      releaseDate: schema.songs.releaseDate,
      eminemRole: schema.songs.eminemRole,
      validatedRapSegments: schema.songs.validatedRapSegments,
      previewUrl: schema.songs.previewUrl,
      deezerTrackId: schema.songs.deezerTrackId,
    })
    .from(schema.songs)
    .where(
      and(
        sql`json_array_length(${schema.songs.validatedRapSegments}) > 0`,
        sql`(${schema.songs.previewUrl} IS NOT NULL OR ${schema.songs.deezerTrackId} IS NOT NULL)`,
      ),
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    album: r.album,
    year: yearFromReleaseDate(r.releaseDate),
    eminemRole: r.eminemRole,
    segments: r.validatedRapSegments,
  }));
}

// Lightweight catalog for distractor generation. Only primary tracks —
// avoids picking obscure feature songs as wrong answers.
export async function getCatalogForDistractors(): Promise<CatalogEntry[]> {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      album: schema.songs.album,
      releaseDate: schema.songs.releaseDate,
      eminemRole: schema.songs.eminemRole,
    })
    .from(schema.songs)
    .where(eq(schema.songs.eminemRole, "primary"))
    .all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    album: r.album,
    year: yearFromReleaseDate(r.releaseDate),
    eminemRole: r.eminemRole,
  }));
}

// Songs that COULD have segments added (have audio) but don't yet, plus
// songs that already have some — used by the admin segment editor.
export type AdminSongRow = {
  id: number;
  title: string;
  primaryArtist: string;
  album: string | null;
  artUrl: string | null;
  segmentCount: number;
};

export async function getAdminSongList(): Promise<AdminSongRow[]> {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      primaryArtist: schema.songs.primaryArtist,
      album: schema.songs.album,
      artUrl: schema.songs.artUrl,
      segments: schema.songs.validatedRapSegments,
      previewUrl: schema.songs.previewUrl,
      deezerTrackId: schema.songs.deezerTrackId,
    })
    .from(schema.songs)
    .where(
      sql`(${schema.songs.previewUrl} IS NOT NULL OR ${schema.songs.deezerTrackId} IS NOT NULL)`,
    )
    .orderBy(schema.songs.title)
    .all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    primaryArtist: r.primaryArtist,
    album: r.album,
    artUrl: r.artUrl,
    segmentCount: r.segments.length,
  }));
}

export async function getSongForEdit(id: number) {
  return db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      primaryArtist: schema.songs.primaryArtist,
      album: schema.songs.album,
      artUrl: schema.songs.artUrl,
      previewUrl: schema.songs.previewUrl,
      deezerTrackId: schema.songs.deezerTrackId,
      segments: schema.songs.validatedRapSegments,
    })
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .get();
}
