/**
 * Fix songs whose deezer_track_id points at an unrelated track (e.g.
 * "The Warning" playing the rock band The Warning, "Welcome to D-Block"
 * playing My Chemical Romance). These came from loose Deezer search matches
 * during seeding, so the preview (and usually the art) is wrong.
 *
 * Mismatch = the Deezer track's title doesn't match ours, OR none of its
 * contributors is the song's primary artist / a featured artist / Eminem.
 *
 * For each mismatch, try to find the right track:
 *   1. Deezer search, accepting a hit whose title + artist match.
 *   2. iTunes search, same rule (stable preview URLs).
 * If neither finds it, clear the Deezer id, preview and art so the app
 * stops playing / showing the wrong song.
 *
 * Rap segments for Guess the Song are tied to the preview audio, so they're
 * reset whenever the preview changes.
 *
 * Usage:
 *   npx tsx scripts/fix-wrong-deezer.ts           # dry run
 *   npx tsx scripts/fix-wrong-deezer.ts --apply
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

// Lowercase, strip accents/punctuation, drop "(feat ...)" / "[...]" /
// " - Remastered" style suffixes, and smooth over spelling variants
// (U/you, 2/to, Pt. II/Part 2, censored words, apostrophes).
function normTitle(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*[([][^)\]]*[)\]]/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\bsh[*!]+t\b/g, "shit")
    .replace(/\bf[*%]+c?k/g, "fuck")
    .replace(/\bn[*]+a/g, "nigga")
    .replace(/[‘’'`´]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bu\b/g, "you")
    .replace(/\b2\b/g, "to")
    .replace(/\bpt\b/g, "part")
    .replace(/\bii\b/g, "2")
    .replace(/\bniggaz\b/g, "niggas")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
function normArtist(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function titleMatches(ours: string, theirs: string): boolean {
  const a = normTitle(ours);
  const b = normTitle(theirs);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // Small typos / variants ("Forget" vs "Forgot", "Our" vs "Your").
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.85;
}

function artistMatches(wanted: string[], names: string[]): boolean {
  const w = wanted.map(normArtist).filter(Boolean);
  return names.some((n) => {
    const nn = normArtist(n);
    if (!nn) return false;
    // Short names (T.I., DMX, D12) must match exactly; longer ones may be
    // contained ("Bizarre (of D12)" ⊇ "bizarre", "JAŸ-Z" ≈ "JAY-Z").
    return w.some((x) =>
      x.length < 4 || nn.length < 4
        ? x === nn
        : nn.includes(x) || x.includes(nn),
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as T & { error?: { code: number } };
        if (body.error?.code === 4) {
          await sleep(2000); // Deezer quota
          continue;
        }
        if (body.error) return null;
        return body;
      }
      if (res.status === 403 || res.status === 429) {
        await sleep(3000);
        continue;
      }
      return null;
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

type DzTrack = {
  id: number;
  title: string;
  preview: string | null;
  duration: number;
  artist: { name: string };
  contributors?: Array<{ name: string }>;
  album: { title: string; cover_xl?: string; cover_big?: string };
};

type Song = typeof schema.songs.$inferSelect;
type Fix =
  | { kind: "deezer"; track: DzTrack }
  | {
      kind: "itunes";
      trackId: number;
      preview: string;
      art: string | null;
      title: string;
      artist: string;
    }
  | { kind: "clear" };

async function findReplacement(song: Song, wanted: string[]): Promise<Fix> {
  // 1. Deezer search
  const queries = [
    `artist:"${song.primaryArtist}" track:"${song.title}"`,
    `${song.title} ${song.primaryArtist}`,
    `${song.title} eminem`,
  ];
  for (const q of queries) {
    const res = await getJson<{ data: DzTrack[] }>(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`,
    );
    await sleep(150);
    for (const t of res?.data ?? []) {
      if (!titleMatches(song.title, t.title)) continue;
      if (/karaoke|instrumental|originally performed|tribute/i.test(t.title))
        continue;
      if (!artistMatches(wanted, [t.artist.name])) continue;
      const full = await getJson<DzTrack>(`https://api.deezer.com/track/${t.id}`);
      await sleep(150);
      if (full?.preview) return { kind: "deezer", track: full };
    }
  }

  // 2. iTunes search
  const it = await getJson<{
    results: Array<{
      trackId: number;
      trackName: string;
      artistName: string;
      previewUrl?: string;
      artworkUrl100?: string;
    }>;
  }>(
    `https://itunes.apple.com/search?entity=song&limit=15&term=${encodeURIComponent(
      `${song.title} ${song.primaryArtist}`,
    )}`,
  );
  for (const r of it?.results ?? []) {
    if (!r.previewUrl) continue;
    if (!titleMatches(song.title, r.trackName)) continue;
    if (/karaoke|instrumental|originally performed|tribute/i.test(r.trackName))
      continue;
    if (!artistMatches(wanted, [r.artistName])) continue;
    return {
      kind: "itunes",
      trackId: r.trackId,
      preview: r.previewUrl,
      art: r.artworkUrl100?.replace("100x100", "600x600") ?? null,
      title: r.trackName,
      artist: r.artistName,
    };
  }
  return { kind: "clear" };
}

async function main() {
  const db = createDbClient();
  const songs = (await db.select().from(schema.songs).all()).filter(
    (s) => s.deezerTrackId !== null,
  );
  console.log(`Checking ${songs.length} songs with a Deezer id...`);

  let fixed = 0;
  let cleared = 0;
  for (const song of songs) {
    const track = await getJson<DzTrack>(
      `https://api.deezer.com/track/${song.deezerTrackId}`,
    );
    await sleep(120);
    if (!track) continue; // lookup failed — don't touch

    const wanted = [song.primaryArtist, ...song.featuredArtists, "Eminem"];
    const names = [
      track.artist.name,
      ...(track.contributors ?? []).map((c) => c.name),
    ];
    const ok = titleMatches(song.title, track.title) && artistMatches(wanted, names);
    if (ok) continue;

    const fix = await findReplacement(song, wanted);
    const label = `#${song.id} "${song.title}" — ${song.primaryArtist}`;
    const was = `was: "${track.title}" by ${track.artist.name}`;

    let patch: Partial<typeof schema.songs.$inferInsert>;
    if (fix.kind === "deezer") {
      const t = fix.track;
      console.log(`~ ${label}\n    ${was}\n    → Deezer ${t.id}: "${t.title}" by ${t.artist.name}`);
      patch = {
        deezerTrackId: t.id,
        previewUrl: t.preview,
        durationMs: t.duration * 1000,
        artUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
        validatedRapSegments: [],
      };
      fixed++;
    } else if (fix.kind === "itunes") {
      console.log(`~ ${label}\n    ${was}\n    → iTunes ${fix.trackId}: "${fix.title}" by ${fix.artist}`);
      patch = {
        deezerTrackId: null,
        previewUrl: fix.preview,
        artUrl: fix.art,
        validatedRapSegments: [],
      };
      fixed++;
    } else {
      console.log(`✕ ${label}\n    ${was}\n    → no correct match found; clearing preview + art`);
      patch = {
        deezerTrackId: null,
        previewUrl: null,
        artUrl: null,
        validatedRapSegments: [],
      };
      cleared++;
    }

    if (APPLY) {
      await db.update(schema.songs).set(patch).where(eq(schema.songs.id, song.id)).run();
    }
  }

  console.log(`\n${fixed} re-matched, ${cleared} cleared.`);
  if (!APPLY) console.log("Dry run. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
