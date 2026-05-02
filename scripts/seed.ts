import { createDbClient } from "../src/db/client";
import { songs, type NewSong } from "../src/db/schema";
import { sql } from "drizzle-orm";

const EMINEM_DEEZER_ID = 13;
const EMINEM_MBID = "b95ce3ff-3d05-4e87-9e01-c97b66af13d4";
const USER_AGENT = "EminemBelly/0.1 ( liamtarzy@gmail.com )";
const MB_BASE = "https://musicbrainz.org/ws/2";
const DZ_BASE = "https://api.deezer.com";

// ─── HTTP helpers (rate limited per host) ──────────────────────────────
let lastMbCall = 0;
async function mbFetch<T>(path: string): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastMbCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbCall = Date.now();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${MB_BASE}${path}${sep}fmt=json`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status} on ${url}`);
  return res.json() as Promise<T>;
}

let dzCalls: number[] = [];
async function dzFetch<T>(path: string): Promise<T> {
  // Deezer: ~50 req per 5s. We'll cap at 25 per 5s for safety.
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

// ─── Title normalization & junk filters ────────────────────────────────
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s*-\s*(remix|edit|version|extended|radio|clean|explicit|live|instrumental|demo|remaster(ed)?|reissue|reread|reedit|reprise|alt(ernate|ernative)?|acoustic|deluxe|bonus|original|album|single).*$/i, "")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArtist(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(featuring|feat\.?|ft\.?|with|&|and|x)\s+.*$/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TITLE_JUNK = /\b(skit|interlude|prelude|prologue|epilogue)\b/i;
const VARIANT_DISAMB = /\b(live|instrumental|a cappella|demo|edit|extended|radio|clean|explicit|karaoke|interview|alternate|alternative|reprise|remix|reissue|reedit|remaster|reread|cover|version|tribute)\b/i;

function deezerJunk(title: string, version?: string): boolean {
  if (TITLE_JUNK.test(title)) return true;
  const blob = `${title} ${version ?? ""}`;
  if (VARIANT_DISAMB.test(blob)) return true;
  return false;
}

// ─── Deezer types ──────────────────────────────────────────────────────
type DzAlbum = {
  id: number;
  title: string;
  release_date: string;
  record_type: string; // album, ep, single, compile
  cover_big?: string;
  cover_xl?: string;
  type: "album";
};
type DzTrack = {
  id: number;
  title: string;
  title_short: string;
  title_version?: string;
  isrc?: string;
  duration: number;
  rank: number;
  preview?: string;
  explicit_lyrics: boolean;
  artist: { id: number; name: string };
  album: { id: number; title: string; cover_big?: string; cover_xl?: string };
};
type DzArtistAlbums = { data: DzAlbum[]; total: number; next?: string };
type DzAlbumDetail = DzAlbum & {
  tracks: { data: DzTrack[]; next?: string };
  contributors: { id: number; name: string; role: string }[];
};
type DzSearch = { data: DzTrack[]; total: number; next?: string };

// ─── Phase 1: Primary tracks via Deezer ────────────────────────────────
async function pullDeezerPrimary(): Promise<NewSong[]> {
  console.log("→ [Deezer] Fetching Eminem albums...");
  const albums: DzAlbum[] = [];
  let url: string | undefined = `/artist/${EMINEM_DEEZER_ID}/albums?limit=100`;
  while (url) {
    const page: DzArtistAlbums = await dzFetch<DzArtistAlbums>(url);
    albums.push(...page.data);
    url = page.next;
  }
  console.log(`  raw album count: ${albums.length}`);

  // Keep albums + EPs, drop pure singles for now (we'll catch single tracks via top tracks pass too)
  const goodAlbums = albums.filter(
    (a) => a.record_type === "album" || a.record_type === "ep",
  );

  console.log(`  after type filter (album/ep): ${goodAlbums.length}`);
  console.log("→ [Deezer] Fetching tracklists...");

  const allTracks: DzTrack[] = [];
  let i = 0;
  for (const album of goodAlbums) {
    i++;
    process.stdout.write(`\r  album ${i}/${goodAlbums.length}: ${album.title.slice(0, 50)}                    `);
    try {
      const detail = await dzFetch<DzAlbumDetail>(`/album/${album.id}`);
      const tracks = detail.tracks?.data ?? [];
      // Walk pagination if present
      let nextUrl = detail.tracks?.next;
      while (nextUrl) {
        const page = await dzFetch<DzSearch>(nextUrl);
        tracks.push(...page.data);
        nextUrl = page.next;
      }
      allTracks.push(...tracks);
    } catch (e) {
      console.warn(`\n  ! album ${album.id} (${album.title}) failed:`, (e as Error).message);
    }
  }
  process.stdout.write(`\n  collected ${allTracks.length} raw tracks\n`);

  // Dedupe: prefer ISRC, fall back to (normalized_title, normalized_artist)
  // Keep the entry with the highest rank (most popular version)
  const byKey = new Map<string, DzTrack>();
  for (const t of allTracks) {
    if (deezerJunk(t.title, t.title_version)) continue;
    const titleKey = normalizeTitle(t.title);
    if (!titleKey) continue;
    const isrcKey = t.isrc?.trim() ? `isrc:${t.isrc.trim()}` : null;
    const fallback = `${titleKey}|${normalizeArtist(t.artist.name)}`;
    const key = isrcKey ?? fallback;
    const existing = byKey.get(key);
    if (!existing || (t.rank ?? 0) > (existing.rank ?? 0)) {
      byKey.set(key, t);
    }
    // Also index by fallback so cross-source dedup catches it later
    if (isrcKey) byKey.set(fallback, byKey.get(key)!);
  }
  // Re-collapse to unique tracks
  const unique = new Set<DzTrack>();
  for (const t of byKey.values()) unique.add(t);

  const rows: NewSong[] = [...unique].map((t) => ({
    musicbrainzId: null,
    title: t.title,
    primaryArtist: t.artist.name,
    featuredArtists: [],
    album: t.album.title,
    releaseDate: null,
    artUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
    previewUrl: t.preview ?? null,
    deezerTrackId: t.id ?? null,
    durationMs: t.duration ? t.duration * 1000 : null,
    eminemRole: t.artist.id === EMINEM_DEEZER_ID ? "primary" : "feature",
  }));

  console.log(`  unique primary tracks: ${rows.length}`);
  return rows;
}

// ─── Phase 2: Features via MusicBrainz ─────────────────────────────────
type MbArtistCredit = { name: string; artist?: { id: string; name: string } };
type MbRecording = {
  id: string;
  title: string;
  length?: number | null;
  video?: boolean;
  disambiguation?: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
};
type MbBrowseRecordings = {
  recordings: MbRecording[];
  "recording-count": number;
};

async function pullMbFeatures(): Promise<NewSong[]> {
  console.log("→ [MusicBrainz] Fetching all recordings credited to Eminem...");
  const all: MbRecording[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await mbFetch<MbBrowseRecordings>(
      `/recording?artist=${EMINEM_MBID}&inc=artist-credits&limit=${limit}&offset=${offset}`,
    );
    all.push(...data.recordings);
    process.stdout.write(`\r  ${all.length}/${data["recording-count"]}`);
    if (offset + limit >= data["recording-count"]) break;
    offset += limit;
  }
  process.stdout.write("\n");

  // Filter to features only (primary credit is NOT Eminem)
  const features = all.filter((rec) => {
    if (rec.video) return false;
    if (TITLE_JUNK.test(rec.title)) return false;
    if (VARIANT_DISAMB.test(rec.title)) return false;
    if (rec.disambiguation && VARIANT_DISAMB.test(rec.disambiguation)) return false;
    const credits = rec["artist-credit"] ?? [];
    if (!credits[0]) return false;
    const primaryMbid = credits[0].artist?.id;
    return primaryMbid && primaryMbid !== EMINEM_MBID;
  });
  console.log(`  feature recordings (post-filter): ${features.length}`);

  // Dedupe by (normalized_title, normalized_primary_artist), keep earliest
  const seen = new Map<string, MbRecording>();
  for (const rec of features) {
    const credits = rec["artist-credit"]!;
    const titleKey = normalizeTitle(rec.title);
    if (!titleKey) continue;
    const artistKey = normalizeArtist(credits[0].name);
    const key = `${titleKey}|${artistKey}`;
    const existing = seen.get(key);
    const recDate = rec["first-release-date"] ?? "9999";
    const existingDate = existing?.["first-release-date"] ?? "9999";
    if (!existing || recDate < existingDate) seen.set(key, rec);
  }
  console.log(`  unique features: ${seen.size}`);

  return [...seen.values()].map((rec): NewSong => {
    const credits = rec["artist-credit"]!;
    const primary = credits[0];
    const featured = credits
      .slice(1)
      .filter((c) => c.artist && c.name && c.name.trim().length > 0)
      .map((c) => c.name);
    return {
      musicbrainzId: rec.id,
      title: rec.title,
      primaryArtist: primary.name,
      featuredArtists: featured,
      album: null,
      releaseDate: rec["first-release-date"] ?? null,
      artUrl: null,
      durationMs: rec.length ?? null,
      eminemRole: "feature",
    };
  });
}

// ─── Phase 3: Art enrichment for features via Deezer search ────────────
async function enrichFeatureArt(features: NewSong[]): Promise<void> {
  console.log("→ [Deezer] Looking up art for features...");
  let i = 0;
  let hits = 0;
  for (const row of features) {
    i++;
    if (row.artUrl) continue;
    const q = encodeURIComponent(`${row.primaryArtist} ${row.title}`);
    try {
      const data = await dzFetch<DzSearch>(`/search?q=${q}&limit=1`);
      const t = data.data?.[0];
      if (t?.album?.cover_xl || t?.album?.cover_big) {
        row.artUrl = t.album.cover_xl ?? t.album.cover_big ?? null;
        if (t.preview) row.previewUrl = t.preview;
        if (t.id) row.deezerTrackId = t.id;
        hits++;
      } else if (t?.preview) {
        // No art but a preview exists; capture it.
        row.previewUrl = t.preview;
        row.deezerTrackId = t.id;
      }
    } catch {
      /* skip */
    }
    if (i % 25 === 0) process.stdout.write(`\r  ${i}/${features.length} (art hits: ${hits})`);
  }
  process.stdout.write(`\r  ${i}/${features.length} (art hits: ${hits})\n`);
}

// ─── Cross-source dedupe ───────────────────────────────────────────────
function crossDedupe(rows: NewSong[]): NewSong[] {
  // Drop a feature if a primary entry exists with same normalized title.
  // (Sometimes a song shows up both ways depending on artist credit ordering.)
  const primaries = new Set<string>();
  for (const r of rows) {
    if (r.eminemRole === "primary") {
      primaries.add(normalizeTitle(r.title));
    }
  }
  return rows.filter((r) => {
    if (r.eminemRole === "feature" && primaries.has(normalizeTitle(r.title))) {
      return false;
    }
    return true;
  });
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const primary = await pullDeezerPrimary();
  const features = await pullMbFeatures();
  await enrichFeatureArt(features);
  const all = crossDedupe([...primary, ...features]);

  console.log(`\n→ Inserting ${all.length} songs...`);
  const db = createDbClient();
  // Wipe old data — schema is small, easier than diff-merging
  await db.delete(songs).run();

  // Insert in batches of 50 — single-row inserts are slow against remote Turso
  const BATCH = 50;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    await db.insert(songs).values(batch).run();
    process.stdout.write(`\r  inserted ${Math.min(i + BATCH, all.length)}/${all.length}`);
  }
  process.stdout.write("\n");

  const counts = await db
    .select({ role: songs.eminemRole, n: sql<number>`count(*)` })
    .from(songs)
    .groupBy(songs.eminemRole)
    .all();
  const withArt = await db
    .select({ n: sql<number>`count(*)` })
    .from(songs)
    .where(sql`${songs.artUrl} is not null`)
    .all();
  console.log("→ Catalog by role:", counts);
  console.log("→ Tracks with art:", withArt[0]?.n);
  console.log("✓ Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
