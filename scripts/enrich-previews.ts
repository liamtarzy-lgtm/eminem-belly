/**
 * Walks every song in the DB and looks up a Deezer preview URL via search,
 * with strict artist + title validation to avoid wrong-song matches like
 * "Heat" → some unrelated track.
 *
 * Default: only enrich songs that don't already have a previewUrl.
 * --force: re-enrich every song (use after fixing matching logic).
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, isNull } from "drizzle-orm";

const DZ_BASE = "https://api.deezer.com";
const EMINEM_DEEZER_ID = 13;
const FORCE = process.argv.includes("--force");

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
  if (!res.ok) throw new Error(`Deezer ${res.status} on ${url}`);
  return res.json() as Promise<T>;
}

type DzTrack = {
  id: number;
  title: string;
  preview?: string;
  artist?: { id: number; name: string };
  album?: { id: number };
};
type DzSearch = { data: DzTrack[]; total: number };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMatch(
  results: DzTrack[],
  song: { title: string; primaryArtist: string; eminemRole: string },
): DzTrack | null {
  const expectedTitle = normalize(song.title);
  const expectedArtist = normalize(song.primaryArtist);

  // Title must match (substring either way) for a candidate to be considered.
  const titleOk = (t: DzTrack) => {
    const tnorm = normalize(t.title);
    return tnorm === expectedTitle || tnorm.includes(expectedTitle) || expectedTitle.includes(tnorm);
  };

  const candidates = results.filter(titleOk);
  if (candidates.length === 0) return null;

  // Strong preference: artist-id match (Eminem = 13 for primary tracks).
  const isEminemSong = expectedArtist === "eminem";
  if (isEminemSong) {
    const exact = candidates.find((t) => t.artist?.id === EMINEM_DEEZER_ID);
    if (exact) return exact;
  }

  // Otherwise: artist name fuzzy match.
  const named = candidates.find((t) => {
    const a = normalize(t.artist?.name ?? "");
    return a === expectedArtist || a.includes(expectedArtist) || expectedArtist.includes(a);
  });
  if (named) return named;

  // No artist-validated match — abstain rather than risk wrong song.
  return null;
}

async function main() {
  const db = createDbClient();
  const all = await db.select().from(schema.songs).all();
  const targets = FORCE
    ? all
    : await db
        .select()
        .from(schema.songs)
        .where(isNull(schema.songs.previewUrl))
        .all();

  console.log(
    `→ ${targets.length} song(s) to enrich (of ${all.length} total)${FORCE ? " [forced]" : ""}`,
  );

  const concurrency = 5;
  let cursor = 0;
  let hits = 0;
  let cleared = 0;
  let misses = 0;

  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const song = targets[i];
      const q = encodeURIComponent(`${song.primaryArtist} ${song.title}`);
      try {
        const data = await dzFetch<DzSearch>(`/search?q=${q}&limit=10`);
        const match = pickBestMatch(data.data ?? [], song);
        if (match?.preview) {
          await db
            .update(schema.songs)
            .set({ previewUrl: match.preview, deezerTrackId: match.id })
            .where(eq(schema.songs.id, song.id))
            .run();
          hits++;
        } else if (FORCE && song.previewUrl) {
          await db
            .update(schema.songs)
            .set({ previewUrl: null, deezerTrackId: null })
            .where(eq(schema.songs.id, song.id))
            .run();
          cleared++;
        } else {
          misses++;
        }
      } catch {
        misses++;
      }
      const done = hits + misses + cleared;
      if (done % 25 === 0) {
        process.stdout.write(
          `\r  ${done}/${targets.length} (hits ${hits}, cleared ${cleared}, miss ${misses})`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write(
    `\r  ${hits + misses + cleared}/${targets.length} (hits ${hits}, cleared ${cleared}, miss ${misses})\n`,
  );
  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
