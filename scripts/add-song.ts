/**
 * Add one song to the catalog from its Deezer track id.
 *
 *   npx tsx scripts/add-song.ts <deezerTrackId> [--title "Override"]
 *
 * Pulls title, artists, album, art, preview and release date from Deezer.
 * Primary artist = Deezer's main artist; featured = the other contributors.
 * eminem_role is "primary" when the main artist is Eminem, else "feature".
 * Refuses tracks Eminem isn't credited on. Idempotent on deezer_track_id.
 *
 * Find ids with: https://api.deezer.com/search?q=<song artist>
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq } from "drizzle-orm";

type DzTrack = {
  id: number;
  title: string;
  title_short?: string;
  preview: string | null;
  duration: number;
  release_date: string;
  artist: { name: string };
  contributors: Array<{ name: string }>;
  album: { title: string; cover_xl?: string; cover_big?: string };
  error?: { message: string };
};

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isFinite(id) || id <= 0) {
    console.error("Usage: npx tsx scripts/add-song.ts <deezerTrackId> [--title ...]");
    process.exit(1);
  }
  const titleIdx = process.argv.indexOf("--title");
  const titleOverride = titleIdx > 0 ? process.argv[titleIdx + 1] : undefined;

  const t = (await (await fetch(`https://api.deezer.com/track/${id}`)).json()) as DzTrack;
  if (t.error) throw new Error(`Deezer: ${t.error.message}`);

  const names = [...new Set(t.contributors.map((c) => c.name))];
  if (!names.some((n) => n.toLowerCase() === "eminem")) {
    throw new Error(`Eminem isn't credited on "${t.title}" (${names.join(", ")})`);
  }

  const db = createDbClient();
  const existing = await db
    .select({ id: schema.songs.id })
    .from(schema.songs)
    .where(eq(schema.songs.deezerTrackId, id))
    .get();
  if (existing) {
    console.log(`= Already in catalog as #${existing.id}`);
    return;
  }

  const primary = t.artist.name;
  const isEminem = primary.toLowerCase() === "eminem";
  const featured = names.filter((n) => n !== primary);
  const title = titleOverride ?? t.title_short ?? t.title;
  const art = t.album.cover_xl ?? t.album.cover_big ?? null;

  const [row] = await db
    .insert(schema.songs)
    .values({
      title,
      primaryArtist: primary,
      featuredArtists: featured,
      album: t.album.title,
      releaseDate: t.release_date,
      artUrl: art,
      previewUrl: t.preview,
      deezerTrackId: id,
      durationMs: t.duration * 1000,
      eminemRole: isEminem ? "primary" : "feature",
    })
    .returning({ id: schema.songs.id })
    .all();

  // Album links only for Eminem's own songs — album rankings are Eminem-only
  // and most features have none.
  if (isEminem) await db
    .insert(schema.songAlbums)
    .values({
      songId: row.id,
      albumName: t.album.title,
      albumArtUrl: art,
      albumReleaseDate: t.release_date,
      isPrimary: true,
    })
    .onConflictDoNothing()
    .run();

  console.log(
    `+ #${row.id} "${title}" — ${primary}${featured.length ? ` ft. ${featured.join(", ")}` : ""} [${t.album.title}]`,
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
