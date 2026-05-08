/**
 * Fills in audio previews + Apple Music track IDs from the iTunes Search
 * API for any songs that don't already have a previewUrl. Targets songs
 * that aren't on Deezer (ShadyXV exclusives, etc.).
 *
 * iTunes URLs are stable (no signed expiry), so we store them directly.
 * Free API, no auth — but rate-limited (~20 req/min), so we throttle.
 *
 * Idempotent: only touches songs missing previewUrl unless --force is given.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, isNull } from "drizzle-orm";

const ITUNES_BASE = "https://itunes.apple.com";
const FORCE = process.argv.includes("--force");

let lastCall = 0;
async function itunesFetch<T>(path: string): Promise<T | null> {
  const now = Date.now();
  const wait = Math.max(0, 3100 - (now - lastCall)); // ~20 req/min
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(`${ITUNES_BASE}${path}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.startsWith("Rate limit")) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
};
type ItunesSearch = { resultCount: number; results: ItunesTrack[] };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMatch(
  results: ItunesTrack[],
  target: { title: string; artist: string },
): ItunesTrack | null {
  const expectedTitle = normalize(target.title);
  const expectedArtist = normalize(target.artist);
  // Strict: title and artist both match
  for (const t of results) {
    if (
      normalize(t.trackName) === expectedTitle &&
      normalize(t.artistName).includes(expectedArtist)
    )
      return t;
  }
  // Loose: title matches and artist overlaps
  for (const t of results) {
    const titleN = normalize(t.trackName);
    const artistN = normalize(t.artistName);
    if (
      (titleN === expectedTitle ||
        titleN.startsWith(expectedTitle) ||
        expectedTitle.startsWith(titleN)) &&
      (artistN.includes(expectedArtist) || expectedArtist.includes(artistN))
    ) {
      return t;
    }
  }
  return null;
}

async function main() {
  const db = createDbClient();
  const targets = FORCE
    ? await db.select().from(schema.songs).all()
    : await db
        .select()
        .from(schema.songs)
        .where(isNull(schema.songs.previewUrl))
        .all();

  console.log(
    `→ ${targets.length} song(s) to enrich via iTunes${FORCE ? " [forced]" : ""}`,
  );

  let hits = 0;
  let misses = 0;
  let i = 0;
  for (const song of targets) {
    i++;
    process.stdout.write(
      `\r  ${i}/${targets.length}: ${song.title.slice(0, 40)}                          `,
    );
    const q = encodeURIComponent(`${song.primaryArtist} ${song.title}`);
    const data = await itunesFetch<ItunesSearch>(
      `/search?term=${q}&entity=song&limit=8`,
    );
    if (!data) {
      misses++;
      continue;
    }
    const match = pickBestMatch(data.results ?? [], {
      title: song.title,
      artist: song.primaryArtist,
    });
    if (!match?.previewUrl) {
      misses++;
      continue;
    }

    const set: Partial<typeof schema.songs.$inferInsert> = {
      previewUrl: match.previewUrl,
      appleMusicTrackId: match.trackId,
    };
    // Only fill art if currently missing (don't override Deezer art).
    if (!song.artUrl && match.artworkUrl100) {
      set.artUrl = match.artworkUrl100.replace("100x100bb", "600x600bb");
    }
    await db.update(schema.songs).set(set).where(eq(schema.songs.id, song.id)).run();
    hits++;
  }
  process.stdout.write("\n");
  console.log(`✓ Done. ${hits} hits, ${misses} misses.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
