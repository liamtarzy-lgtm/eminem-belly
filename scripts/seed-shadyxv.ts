/**
 * Manually curates the ShadyXV album. ShadyXV (2014) isn't on Deezer's artist
 * catalog under Eminem, so we hardcode the tracklist + try to find each track
 * individually for preview audio + art.
 *
 * Idempotent: running multiple times UPSERTs songs and song_albums entries.
 * Existing user rankings are preserved (matched by deezer_track_id or
 * normalized title+artist).
 */
import { createDbClient } from "../src/db/client";
import { songs, songAlbums } from "../src/db/schema";
import { eq, and, sql, like } from "drizzle-orm";

const DZ_BASE = "https://api.deezer.com";
const ALBUM_NAME = "ShadyXV";
const RELEASE_DATE = "2014-11-24";

let dzCalls: number[] = [];
async function dzFetch<T>(path: string): Promise<T> {
  while (true) {
    const now = Date.now();
    dzCalls = dzCalls.filter((t) => now - t < 5000);
    if (dzCalls.length < 25) {
      dzCalls.push(now);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const url = path.startsWith("http") ? path : `${DZ_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Deezer ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

type DzTrack = {
  id: number;
  title: string;
  preview?: string;
  duration?: number;
  artist?: { id: number; name: string };
  album?: { id: number; cover_big?: string; cover_xl?: string };
};
type DzSearch = { data: DzTrack[]; total: number };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Track = {
  title: string;
  primary: string;
  featured: string[];
};

// Disc 1 — the new material on ShadyXV. Disc 2 is greatest-hits already
// covered by other albums, so we skip it.
const TRACKLIST: Track[] = [
  { title: "ShadyXV", primary: "Eminem", featured: [] },
  {
    title: "Psychopath Killer",
    primary: "Slaughterhouse",
    featured: ["Yelawolf", "Eminem"],
  },
  { title: "Down", primary: "Eminem", featured: [] },
  {
    title: "Detroit Vs. Everybody",
    primary: "Eminem",
    featured: [
      "Royce da 5'9\"",
      "Big Sean",
      "Danny Brown",
      "Dej Loaf",
      "Trick-Trick",
    ],
  },
  { title: "Y'All Ready Know", primary: "Slaughterhouse", featured: [] },
  {
    title: "Twisted",
    primary: "Skylar Grey",
    featured: ["Eminem", "Yelawolf"],
  },
  { title: "Guts Over Fear", primary: "Eminem", featured: ["Sia"] },
  { title: "Right For Me", primary: "Eminem", featured: [] },
  { title: "Vegas", primary: "Eminem", featured: [] },
  { title: "Bane", primary: "Bad Meets Evil", featured: [] },
  { title: "Die Alone", primary: "Eminem", featured: ["Kobe"] },
  { title: "Calm Down", primary: "Busta Rhymes", featured: ["Eminem"] },
];

function pickMatch(results: DzTrack[], track: Track): DzTrack | null {
  const expectedTitle = normalize(track.title);
  const expectedArtist = normalize(track.primary);
  // Strict: title + artist both match
  for (const t of results) {
    if (
      normalize(t.title) === expectedTitle &&
      normalize(t.artist?.name ?? "").includes(expectedArtist)
    )
      return t;
  }
  // Looser: title matches, artist is reasonable
  for (const t of results) {
    const titleN = normalize(t.title);
    const artistN = normalize(t.artist?.name ?? "");
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

async function findOnDeezer(track: Track): Promise<DzTrack | null> {
  const q = encodeURIComponent(`${track.primary} ${track.title}`);
  try {
    const data = await dzFetch<DzSearch>(`/search?q=${q}&limit=8`);
    return pickMatch(data.data ?? [], track);
  } catch {
    return null;
  }
}

async function main() {
  const db = createDbClient();
  console.log(`→ Curating "${ALBUM_NAME}" (${TRACKLIST.length} tracks)`);

  // Idempotent: wipe existing ShadyXV mappings before re-creating, so
  // tracks removed from TRACKLIST (e.g. Wicked Ways) actually go away.
  const wipeRes = await db
    .delete(songAlbums)
    .where(eq(songAlbums.albumName, ALBUM_NAME))
    .run();
  const wiped = (wipeRes as { rowsAffected?: number }).rowsAffected ?? 0;
  if (wiped) console.log(`  wiped ${wiped} previous ShadyXV mappings`);

  let albumCover: string | null = null;
  let processed = 0;
  let attached = 0;
  let inserted = 0;
  let withPreview = 0;

  for (const track of TRACKLIST) {
    processed++;
    process.stdout.write(`\r  ${processed}/${TRACKLIST.length}: ${track.title.slice(0, 40)}                          `);

    const dzMatch = await findOnDeezer(track);
    const previewUrl = dzMatch?.preview ?? null;
    const artUrl =
      dzMatch?.album?.cover_xl ?? dzMatch?.album?.cover_big ?? null;
    const dzId = dzMatch?.id ?? null;
    if (previewUrl) withPreview++;
    if (!albumCover && artUrl) albumCover = artUrl;

    // Find existing song in DB: prefer match by deezer_track_id, fall back to
    // (normalized title, normalized primary artist).
    let songId: number | null = null;
    if (dzId) {
      const byDzId = await db
        .select({ id: songs.id })
        .from(songs)
        .where(eq(songs.deezerTrackId, dzId))
        .get();
      if (byDzId) songId = byDzId.id;
    }
    if (!songId) {
      // Loose title match for songs without a deezer id
      const titlePat = `%${track.title.replace(/['"]/g, "")}%`;
      const candidates = await db
        .select({
          id: songs.id,
          title: songs.title,
          primaryArtist: songs.primaryArtist,
        })
        .from(songs)
        .where(like(songs.title, titlePat))
        .all();
      const expectedT = normalize(track.title);
      const expectedA = normalize(track.primary);
      const found = candidates.find(
        (c) =>
          normalize(c.title) === expectedT &&
          normalize(c.primaryArtist).includes(expectedA),
      );
      if (found) songId = found.id;
    }

    if (songId) {
      // Update with any new info we picked up
      await db
        .update(songs)
        .set({
          previewUrl: previewUrl ?? sql`${songs.previewUrl}`,
          deezerTrackId: dzId ?? sql`${songs.deezerTrackId}`,
          artUrl: artUrl ?? sql`${songs.artUrl}`,
        })
        .where(eq(songs.id, songId))
        .run();
      attached++;
    } else {
      // Insert new
      const result = await db
        .insert(songs)
        .values({
          title: track.title,
          primaryArtist: track.primary,
          featuredArtists: track.featured,
          album: ALBUM_NAME,
          releaseDate: RELEASE_DATE,
          artUrl,
          previewUrl,
          deezerTrackId: dzId,
          durationMs: dzMatch?.duration ? dzMatch.duration * 1000 : null,
          eminemRole:
            track.primary === "Eminem" || track.featured.includes("Eminem")
              ? track.primary === "Eminem"
                ? "primary"
                : "feature"
              : "feature",
        })
        .returning({ id: songs.id })
        .all();
      songId = result[0].id;
      inserted++;
    }

    if (songId) {
      // Determine if ShadyXV is the primary album for this song (only when no
      // other appearance exists yet).
      const existing = await db
        .select({ id: songAlbums.id })
        .from(songAlbums)
        .where(eq(songAlbums.songId, songId))
        .all();
      const isPrimary = existing.length === 0;
      await db
        .insert(songAlbums)
        .values({
          songId,
          albumName: ALBUM_NAME,
          albumArtUrl: albumCover,
          albumReleaseDate: RELEASE_DATE,
          isPrimary,
        })
        .onConflictDoUpdate({
          target: [songAlbums.songId, songAlbums.albumName],
          set: {
            albumArtUrl: albumCover ?? sql`${songAlbums.albumArtUrl}`,
            albumReleaseDate: RELEASE_DATE,
          },
        })
        .run();
    }
  }

  // Backfill: now that we have a confirmed album cover, update every
  // ShadyXV song_albums row to use it.
  if (albumCover) {
    await db
      .update(songAlbums)
      .set({ albumArtUrl: albumCover })
      .where(
        and(
          eq(songAlbums.albumName, ALBUM_NAME),
          sql`${songAlbums.albumArtUrl} IS NULL`,
        ),
      )
      .run();
  }

  process.stdout.write("\n");
  console.log(
    `  ${inserted} new, ${attached} attached to existing, ${withPreview} with preview`,
  );
  console.log(
    `  album cover: ${albumCover ? "found" : "NOT FOUND — ShadyXV will display without art"}`,
  );
  console.log("✓ ShadyXV curated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
