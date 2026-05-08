/**
 * Hardcoded iTunes track IDs for ShadyXV-exclusive songs that the
 * generic enrich-itunes script missed (artist credits differed in
 * iTunes vs our DB — Vegas as "Bad Meets Evil" not "Eminem", Down as
 * "Yelawolf", Bane as "D12", etc.).
 *
 * Looks up each ID via iTunes /lookup, grabs the previewUrl, and stores
 * it on the matching song row in our DB. Idempotent.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, and, or, sql } from "drizzle-orm";

const ITUNES_BASE = "https://itunes.apple.com";

let last = 0;
async function itunes<T>(path: string): Promise<T | null> {
  const wait = Math.max(0, 3100 - (Date.now() - last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(`${ITUNES_BASE}${path}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl?: string;
  artworkUrl100?: string;
};
type ItunesLookup = { resultCount: number; results: ItunesTrack[] };

// (title, artist-in-our-db) → iTunes track id
const MAP: Array<{ title: string; artistContains: string; itunesId: number }> = [
  { title: "ShadyXV", artistContains: "Eminem", itunesId: 1443175507 },
  { title: "Down", artistContains: "Eminem", itunesId: 1443175618 }, // iTunes credits Yelawolf
  { title: "Vegas", artistContains: "Eminem", itunesId: 1443175607 }, // iTunes credits Bad Meets Evil
  { title: "Bane", artistContains: "Bad Meets Evil", itunesId: 1443175621 }, // iTunes credits D12
  { title: "Die Alone", artistContains: "Eminem", itunesId: 1443175605 },
  { title: "Right For Me", artistContains: "Eminem", itunesId: 1443175636 },
  { title: "Calm Down", artistContains: "Busta", itunesId: 1443175643 },
];

async function main() {
  const db = createDbClient();
  let updated = 0;

  for (const entry of MAP) {
    const data = await itunes<ItunesLookup>(`/lookup?id=${entry.itunesId}`);
    const t = data?.results?.[0];
    if (!t?.previewUrl) {
      console.log(`  ⚠ ${entry.title}: no preview from iTunes lookup`);
      continue;
    }

    const result = await db
      .update(schema.songs)
      .set({
        previewUrl: t.previewUrl,
        appleMusicTrackId: t.trackId,
        // Also fix art if missing
        artUrl: sql`coalesce(${schema.songs.artUrl}, ${t.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null})`,
      })
      .where(
        and(
          eq(schema.songs.title, entry.title),
          sql`lower(${schema.songs.primaryArtist}) LIKE ${`%${entry.artistContains.toLowerCase()}%`}`,
        ),
      )
      .run();
    const affected = (result as { rowsAffected?: number }).rowsAffected ?? 0;
    if (affected) {
      console.log(`  ✓ ${entry.title} (${entry.artistContains}) → preview attached`);
      updated += affected;
    } else {
      console.log(`  ⚠ ${entry.title} (${entry.artistContains}) → no DB row matched`);
    }
  }

  console.log(`Done. ${updated} rows updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
