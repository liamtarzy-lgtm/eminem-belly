import { createDbClient } from "../src/db/client";
import { songs, songAlbums, type NewSong } from "../src/db/schema";
import { sql, eq, and, or, isNotNull, notInArray, inArray } from "drizzle-orm";
import { canonicalAlbumName, isCompilationAlbum } from "../src/lib/album";

const EMINEM_DEEZER_ID = 13;
const D12_DEEZER_ID = 417645;
const BAD_MEETS_EVIL_DEEZER_ID = 1272458;
// Artists whose tracks should be treated as Eminem-primary (count toward
// album rankings, surface in recommendations, etc.). Eminem himself, D12
// (he's a member), and Bad Meets Evil (Eminem + Royce).
const PRIMARY_ARTIST_IDS = new Set<number>([
  EMINEM_DEEZER_ID,
  D12_DEEZER_ID,
  BAD_MEETS_EVIL_DEEZER_ID,
]);
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

type Appearance = {
  albumTitle: string;
  albumArt: string | null;
  albumReleaseDate: string | null;
};

// Albums NOT in Eminem's Deezer artist page that should still be pulled.
// Tracks are kept if the primary artist is in PRIMARY_ARTIST_IDS.
const SUPPLEMENTAL_ALBUM_IDS: number[] = [
  371899, // 8 Mile (Music From And Inspired By The Motion Picture)
  121080, // Devils Night (D12, 2001)
  118871, // D-12 World (D12, 2004)
  236712952, // Devil's Night (Expanded Edition) (D12, 2021)
  321101807, // Shit On You EP (D12, 2000)
  1126187, // Hell: The Sequel (Deluxe) — Bad Meets Evil (2011)
];

// ─── Phase 1: Primary tracks via Deezer ────────────────────────────────
async function pullDeezerPrimary(): Promise<{
  rows: NewSong[];
  appearancesByDzId: Map<number, Appearance[]>;
  singleAlbumNames: string[];
}> {
  console.log("→ [Deezer] Fetching Eminem albums...");
  const albums: DzAlbum[] = [];
  let url: string | undefined = `/artist/${EMINEM_DEEZER_ID}/albums?limit=100`;
  while (url) {
    const page: DzArtistAlbums = await dzFetch<DzArtistAlbums>(url);
    albums.push(...page.data);
    url = page.next;
  }
  console.log(`  raw album count: ${albums.length}`);

  const supplementalIds = new Set<number>();
  for (const id of SUPPLEMENTAL_ALBUM_IDS) {
    try {
      const a = await dzFetch<DzAlbum>(`/album/${id}`);
      albums.push(a);
      supplementalIds.add(a.id);
      console.log(`  + supplemental: ${a.title}`);
    } catch (e) {
      console.warn(
        `  ! supplemental album ${id} failed:`,
        (e as Error).message,
      );
    }
  }

  // Include singles too — many Eminem tracks (Detroit Vs Everybody,
  // Killshot, Campaign Speech, etc.) only ship as singles. The deezerJunk
  // filter still drops obvious variants (remixes, edits) inside them.
  const sortedAlbums = albums
    .filter(
      (a) =>
        a.record_type === "album" ||
        a.record_type === "ep" ||
        a.record_type === "single",
    )
    .sort((a, b) => (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999"));

  // Process order: real albums (album/ep) → compilations → singles.
  // Real albums claim songs first so a track on both DOSS and a Houdini
  // single ends up attributed to DOSS, not the single. Singles process last
  // and only claim orphan tracks. song_albums entries are NOT created for
  // singles (they're not really albums) — see below.
  const realAlbums = sortedAlbums.filter(
    (a) =>
      (a.record_type === "album" || a.record_type === "ep") &&
      !isCompilationAlbum(a.record_type, a.title),
  );
  const compAlbums = sortedAlbums.filter((a) =>
    isCompilationAlbum(a.record_type, a.title),
  );
  const singleAlbums = sortedAlbums.filter((a) => a.record_type === "single");
  console.log(
    `  studio: ${realAlbums.length}  comps: ${compAlbums.length}  singles: ${singleAlbums.length}`,
  );

  console.log("→ [Deezer] Fetching tracklists (albums → comps → singles)...");
  const orderedAlbums = [...realAlbums, ...compAlbums, ...singleAlbums];
  const singleAlbumIds = new Set(singleAlbums.map((a) => a.id));
  const tracksFromAlbum = new Map<number, DzTrack[]>();
  let i = 0;
  for (const album of orderedAlbums) {
    i++;
    process.stdout.write(
      `\r  album ${i}/${orderedAlbums.length}: ${album.title.slice(0, 50)}                    `,
    );
    try {
      const detail = await dzFetch<DzAlbumDetail>(`/album/${album.id}`);
      const tracks = detail.tracks?.data ?? [];
      let nextUrl = detail.tracks?.next;
      while (nextUrl) {
        const page = await dzFetch<DzSearch>(nextUrl);
        tracks.push(...page.data);
        nextUrl = page.next;
      }
      tracksFromAlbum.set(album.id, tracks);
    } catch (e) {
      console.warn(
        `\n  ! album ${album.id} (${album.title}) failed:`,
        (e as Error).message,
      );
    }
  }
  process.stdout.write("\n");

  // Walk albums in chronological order. First album to claim a song wins —
  // so a track on both Encore (2004) and Curtain Call (2005) is attributed
  // to Encore as its PRIMARY album. We also record every other appearance so
  // album rankings can credit the song to all albums it shipped on.
  const claimedByKey = new Map<string, { track: DzTrack; albumTitle: string }>();
  // Keyed by Deezer track id. List is in chronological order; first entry is
  // primary.
  const appearancesByDzId = new Map<number, Appearance[]>();

  for (const album of orderedAlbums) {
    const tracks = tracksFromAlbum.get(album.id) ?? [];
    const canonAlbum = canonicalAlbumName(album.title);
    const albumArt = album.cover_xl ?? album.cover_big ?? null;
    const isSupplemental = supplementalIds.has(album.id);
    const isSingle = singleAlbumIds.has(album.id);
    for (const t of tracks) {
      if (deezerJunk(t.title, t.title_version)) continue;
      // For supplemental albums, keep only tracks where the primary artist
      // is Eminem or D12 — otherwise we'd inherit every Various Artists
      // track from the 8 Mile soundtrack, etc.
      if (isSupplemental && !PRIMARY_ARTIST_IDS.has(t.artist.id)) continue;
      const titleKey = normalizeTitle(t.title);
      if (!titleKey) continue;

      // Singles are NOT considered albums — don't record them as appearances.
      // They still claim primary on songs.album below if no real album does,
      // so the song still has *some* album label for display.
      if (!isSingle) {
        const existing = appearancesByDzId.get(t.id) ?? [];
        if (!existing.some((a) => a.albumTitle === canonAlbum)) {
          existing.push({
            albumTitle: canonAlbum,
            albumArt,
            albumReleaseDate: album.release_date ?? null,
          });
          appearancesByDzId.set(t.id, existing);
        }
      }

      // Primary-album dedup (existing logic — first claim wins)
      const isrcKey = t.isrc?.trim() ? `isrc:${t.isrc.trim()}` : null;
      const fallback = `${titleKey}|${normalizeArtist(t.artist.name)}`;
      const key = isrcKey ?? fallback;
      if (claimedByKey.has(key)) continue;
      claimedByKey.set(key, { track: t, albumTitle: canonAlbum });
      if (isrcKey && !claimedByKey.has(fallback)) {
        claimedByKey.set(fallback, { track: t, albumTitle: canonAlbum });
      }
    }
  }


  // Re-collapse via track ids so each track appears once
  const seenTrackIds = new Set<number>();
  const rows: NewSong[] = [];
  for (const { track: t, albumTitle } of claimedByKey.values()) {
    if (seenTrackIds.has(t.id)) continue;
    seenTrackIds.add(t.id);
    rows.push({
      musicbrainzId: null,
      title: t.title,
      primaryArtist: t.artist.name,
      featuredArtists: [],
      album: albumTitle,
      releaseDate: null,
      artUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
      previewUrl: t.preview ?? null,
      deezerTrackId: t.id ?? null,
      durationMs: t.duration ? t.duration * 1000 : null,
      eminemRole: PRIMARY_ARTIST_IDS.has(t.artist.id) ? "primary" : "feature",
    });
  }

  console.log(`  unique primary tracks: ${rows.length}`);
  const singleAlbumNames = singleAlbums.map((a) => canonicalAlbumName(a.title));
  return { rows, appearancesByDzId, singleAlbumNames };
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
  const { rows: primary, appearancesByDzId, singleAlbumNames } =
    await pullDeezerPrimary();
  const features = await pullMbFeatures();
  await enrichFeatureArt(features);
  const all = crossDedupe([...primary, ...features]);

  console.log(`\n→ Upserting ${all.length} songs (preserving rankings)...`);
  const db = createDbClient();

  // Pull existing songs once so we can match by deezer_track_id (preferred,
  // most stable) or by (normalized title + normalized primary artist).
  // Songs in the DB but absent from this seed are LEFT ALONE — they may be
  // referenced by user rankings.
  const existing = await db.select().from(songs).all();
  const byTrackId = new Map<number, number>(); // deezer_track_id → song.id
  const byTitleArtist = new Map<string, number>();
  for (const s of existing) {
    if (s.deezerTrackId !== null) byTrackId.set(s.deezerTrackId, s.id);
    const key = `${normalizeTitle(s.title)}|${normalizeArtist(s.primaryArtist)}`;
    if (!byTitleArtist.has(key)) byTitleArtist.set(key, s.id);
  }

  let inserted = 0;
  let updated = 0;
  for (const row of all) {
    const matchById = row.deezerTrackId
      ? byTrackId.get(row.deezerTrackId)
      : undefined;
    const matchByTitle =
      matchById ??
      byTitleArtist.get(
        `${normalizeTitle(row.title)}|${normalizeArtist(row.primaryArtist)}`,
      );
    if (matchByTitle) {
      await db
        .update(songs)
        .set({
          title: row.title,
          primaryArtist: row.primaryArtist,
          featuredArtists: row.featuredArtists,
          album: row.album,
          artUrl: row.artUrl,
          previewUrl: row.previewUrl,
          deezerTrackId: row.deezerTrackId,
          durationMs: row.durationMs,
          eminemRole: row.eminemRole,
        })
        .where(eq(songs.id, matchByTitle))
        .run();
      updated++;
    } else {
      await db.insert(songs).values(row).run();
      inserted++;
    }
    if ((inserted + updated) % 25 === 0) {
      process.stdout.write(
        `\r  ${inserted + updated}/${all.length} (${updated} updated, ${inserted} new)`,
      );
    }
  }
  process.stdout.write(
    `\r  ${inserted + updated}/${all.length} (${updated} updated, ${inserted} new)\n`,
  );

  // Final pass: normalize album names on every song (catches existing rows
  // not covered by the upsert above — e.g. orphan tracks from prior seeds).
  console.log("→ Normalizing album names...");
  const allInDb = await db
    .select({ id: songs.id, album: songs.album })
    .from(songs)
    .all();
  let renamed = 0;
  for (const s of allInDb) {
    if (!s.album) continue;
    const canon = canonicalAlbumName(s.album);
    if (canon !== s.album) {
      await db.update(songs).set({ album: canon }).where(eq(songs.id, s.id)).run();
      renamed++;
    }
  }
  console.log(`  renamed ${renamed} albums`);

  // Clean up legacy single-as-album entries from previous seed runs.
  // Singles aren't real albums — Houdini shouldn't show as its own album
  // when it's a track on Death of Slim Shady.
  if (singleAlbumNames.length > 0) {
    let purged = 0;
    for (const name of singleAlbumNames) {
      const res = await db
        .delete(songAlbums)
        .where(eq(songAlbums.albumName, name))
        .run();
      // libsql returns rowsAffected; sum if available
      const affected =
        (res as { rowsAffected?: number }).rowsAffected ?? 0;
      purged += affected;
    }
    console.log(`  purged ${purged} legacy single-album song_albums rows`);
  }

  // Populate song_albums (one row per song × album it appears on). Lets the
  // album rankings page credit a song to every album it ships on, not just
  // its primary album. Idempotent — re-runs UPSERT existing rows.
  console.log("→ Writing song_albums (multi-album mapping)...");
  const songsWithDzId = await db
    .select({ id: songs.id, deezerTrackId: songs.deezerTrackId, album: songs.album, artUrl: songs.artUrl })
    .from(songs)
    .all();
  const songIdByDzId = new Map<number, number>();
  for (const s of songsWithDzId) {
    if (s.deezerTrackId !== null) songIdByDzId.set(s.deezerTrackId, s.id);
  }

  let appearancesWritten = 0;
  for (const [dzId, appearances] of appearancesByDzId.entries()) {
    const songId = songIdByDzId.get(dzId);
    if (!songId) continue;
    for (let i = 0; i < appearances.length; i++) {
      const a = appearances[i];
      await db
        .insert(songAlbums)
        .values({
          songId,
          albumName: a.albumTitle,
          albumArtUrl: a.albumArt,
          albumReleaseDate: a.albumReleaseDate,
          isPrimary: i === 0,
        })
        .onConflictDoUpdate({
          target: [songAlbums.songId, songAlbums.albumName],
          set: {
            albumArtUrl: a.albumArt,
            albumReleaseDate: a.albumReleaseDate,
            isPrimary: i === 0,
          },
        })
        .run();
      appearancesWritten++;
    }
  }
  // Backfill: any song that has a primary album but no song_albums entry at
  // all (e.g. older rows from the previous seed that don't match a Deezer
  // track id) — give them a single primary entry.
  const orphans = await db
    .select({ id: songs.id, album: songs.album, artUrl: songs.artUrl })
    .from(songs)
    .where(isNotNull(songs.album))
    .all();
  const songsWithAlbumEntry = new Set(
    (
      await db.select({ songId: songAlbums.songId }).from(songAlbums).all()
    ).map((r) => r.songId),
  );
  let backfilled = 0;
  for (const s of orphans) {
    if (songsWithAlbumEntry.has(s.id)) continue;
    if (!s.album) continue;
    await db
      .insert(songAlbums)
      .values({
        songId: s.id,
        albumName: canonicalAlbumName(s.album),
        albumArtUrl: s.artUrl,
        isPrimary: true,
      })
      .onConflictDoNothing()
      .run();
    backfilled++;
  }
  console.log(
    `  wrote ${appearancesWritten} appearances + backfilled ${backfilled} orphans`,
  );

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
