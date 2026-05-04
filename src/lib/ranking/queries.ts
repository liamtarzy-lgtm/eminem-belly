import { db, schema } from "@/db";
import { and, asc, desc, eq, like, notInArray, or, sql } from "drizzle-orm";
import { rankToScore } from "@/lib/score";

export type RankedSong = {
  rankingId: number;
  position: number;
  tiedWithSongId: number | null;
  song: typeof schema.songs.$inferSelect;
};

export async function getRanking(userId: string): Promise<RankedSong[]> {
  return db
    .select({
      rankingId: schema.rankings.id,
      position: schema.rankings.position,
      tiedWithSongId: schema.rankings.tiedWithSongId,
      song: schema.songs,
    })
    .from(schema.rankings)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.rankings.songId))
    .where(eq(schema.rankings.userId, userId))
    .orderBy(asc(schema.rankings.position))
    .all();
}

// Walks a position-sorted ranking and assigns each entry a display rank.
// Adjacent entries marked tied (via tied_with_song_id pointing at each other)
// share the same display rank — matches Beli's "too tough" semantics.
export type RankedSongWithDisplay = RankedSong & { displayRank: number };

export function withDisplayRanks(items: RankedSong[]): RankedSongWithDisplay[] {
  const out: RankedSongWithDisplay[] = [];
  let prevDisplayRank = 0;
  let prevSongId: number | null = null;
  let prevTied: number | null = null;
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const tiedToPrev =
      prevSongId !== null &&
      (r.tiedWithSongId === prevSongId || prevTied === r.song.id);
    const displayRank = tiedToPrev ? prevDisplayRank : i + 1;
    out.push({ ...r, displayRank });
    prevDisplayRank = displayRank;
    prevSongId = r.song.id;
    prevTied = r.tiedWithSongId;
  }
  return out;
}

export async function getSongAtPosition(userId: string, position: number) {
  return db
    .select({ song: schema.songs, rankingId: schema.rankings.id })
    .from(schema.rankings)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.rankings.songId))
    .where(
      and(
        eq(schema.rankings.userId, userId),
        eq(schema.rankings.position, position),
      ),
    )
    .get();
}

export async function getSongInRangeExcluding(
  userId: string,
  lowInclusive: number,
  highExclusive: number,
  excludeSongIds: number[],
) {
  // Pick the "middle" position first; if that song is excluded, fall back to a
  // different position in the range that's not excluded.
  const mid = Math.floor((lowInclusive + highExclusive) / 2);
  const midRow = await getSongAtPosition(userId, mid);
  if (midRow && !excludeSongIds.includes(midRow.song.id)) {
    return { ...midRow, position: mid };
  }

  const conditions = [
    eq(schema.rankings.userId, userId),
    sql`${schema.rankings.position} >= ${lowInclusive}`,
    sql`${schema.rankings.position} < ${highExclusive}`,
  ];
  if (excludeSongIds.length) {
    conditions.push(notInArray(schema.rankings.songId, excludeSongIds));
  }

  const candidates = await db
    .select({
      song: schema.songs,
      rankingId: schema.rankings.id,
      position: schema.rankings.position,
    })
    .from(schema.rankings)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.rankings.songId))
    .where(and(...conditions))
    .all();

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) => Math.abs(a.position - mid) - Math.abs(b.position - mid),
  );
  return candidates[0];
}

export async function searchCatalog(query: string, limit = 20) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;
  return db
    .select()
    .from(schema.songs)
    .where(
      or(
        like(schema.songs.title, pattern),
        like(schema.songs.primaryArtist, pattern),
      ),
    )
    .orderBy(
      desc(eq(schema.songs.eminemRole, "primary")),
      asc(schema.songs.title),
    )
    .limit(limit)
    .all();
}

export async function getSongById(id: number) {
  return db.select().from(schema.songs).where(eq(schema.songs.id, id)).get();
}

export async function getRankingForSong(userId: string, songId: number) {
  return db
    .select()
    .from(schema.rankings)
    .where(
      and(
        eq(schema.rankings.userId, userId),
        eq(schema.rankings.songId, songId),
      ),
    )
    .get();
}

export async function getActiveSession(userId: string) {
  return db
    .select()
    .from(schema.insertionSessions)
    .where(
      and(
        eq(schema.insertionSessions.userId, userId),
        eq(schema.insertionSessions.status, "active"),
      ),
    )
    .orderBy(desc(schema.insertionSessions.createdAt))
    .get();
}

export type RankingStats = {
  songsRanked: number;
  albumsCovered: number;
  comparisons: number;
  topScore: number;
};

export async function getStats(userId: string): Promise<RankingStats> {
  const songsRankedRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.rankings)
    .where(eq(schema.rankings.userId, userId))
    .get();
  const songsRanked = songsRankedRow?.n ?? 0;

  const comparisonsRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.comparisons)
    .where(eq(schema.comparisons.userId, userId))
    .get();
  const comparisonsCount = comparisonsRow?.n ?? 0;

  const albumsRow = await db
    .select({ n: sql<number>`count(distinct ${schema.songs.album})` })
    .from(schema.rankings)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.rankings.songId))
    .where(
      and(
        eq(schema.rankings.userId, userId),
        eq(schema.songs.eminemRole, "primary"),
        sql`${schema.songs.album} is not null`,
      ),
    )
    .get();
  const albumsCovered = albumsRow?.n ?? 0;

  const topScore = songsRanked > 0 ? rankToScore(1, songsRanked) : 0;

  return {
    songsRanked,
    albumsCovered,
    comparisons: comparisonsCount,
    topScore,
  };
}

export async function getRankingCount(userId: string): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.rankings)
    .where(eq(schema.rankings.userId, userId))
    .get();
  return row?.n ?? 0;
}

export type AlbumRanking = {
  album: string;
  avgScore: number;
  songCount: number;
  topSong: typeof schema.songs.$inferSelect;
  songs: { position: number; song: typeof schema.songs.$inferSelect; score: number }[];
};

export async function getAlbumRankings(userId: string): Promise<AlbumRanking[]> {
  const ranked = await db
    .select({
      position: schema.rankings.position,
      song: schema.songs,
    })
    .from(schema.rankings)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.rankings.songId))
    .where(eq(schema.rankings.userId, userId))
    .orderBy(asc(schema.rankings.position))
    .all();

  const total = ranked.length;
  const grouped = new Map<
    string,
    { position: number; song: typeof schema.songs.$inferSelect; score: number }[]
  >();
  for (const r of ranked) {
    if (!r.song.album) continue;
    if (r.song.eminemRole !== "primary") continue;
    const score = rankToScore(r.position, total);
    const arr = grouped.get(r.song.album) ?? [];
    arr.push({ position: r.position, song: r.song, score });
    grouped.set(r.song.album, arr);
  }

  const result: AlbumRanking[] = [];
  for (const [album, songs] of grouped.entries()) {
    const avgScore = songs.reduce((s, x) => s + x.score, 0) / songs.length;
    const topSong = songs[0].song;
    result.push({ album, avgScore, songCount: songs.length, topSong, songs });
  }
  result.sort((a, b) => b.avgScore - a.avgScore);
  return result;
}

// Title patterns + age filter for tracks not worth ranking. Applied at query
// time (no destructive deletes) — songs already ranked stay in the user's
// list even if they'd now be filtered.
const NOT_A_SONG_PATTERN = sql`(
  ${schema.songs.title} LIKE '%(skit)%'
  OR ${schema.songs.title} LIKE '%[skit]%'
  OR ${schema.songs.title} LIKE '%(intro)%'
  OR ${schema.songs.title} LIKE '%(outro)%'
  OR ${schema.songs.title} LIKE '%(interlude)%'
  OR lower(${schema.songs.title}) LIKE '%- intro%'
  OR lower(${schema.songs.title}) LIKE '%- outro%'
  OR lower(${schema.songs.title}) LIKE '%- skit%'
  OR lower(${schema.songs.title}) = 'intro'
  OR lower(${schema.songs.title}) = 'outro'
  OR lower(${schema.songs.title}) = 'skit'
  OR lower(${schema.songs.title}) = 'interlude'
  OR (${schema.songs.durationMs} IS NOT NULL AND ${schema.songs.durationMs} < 60000)
  -- Pre-98 dropout: skip Slim Shady EP and any feature with a known release
  -- date before 1998. Keep Infinite (1996) per user preference.
  OR ${schema.songs.album} = 'Slim Shady EP'
  OR (
    ${schema.songs.releaseDate} IS NOT NULL
    AND ${schema.songs.releaseDate} < '1998-01-01'
    AND (${schema.songs.album} IS NULL OR ${schema.songs.album} != 'Infinite')
  )
)`;

// ─── Saved songs ───────────────────────────────────────────────────────
export type SavedSongRow = {
  savedId: number;
  song: typeof schema.songs.$inferSelect;
  createdAt: Date;
};

export async function getSavedSongs(userId: string): Promise<SavedSongRow[]> {
  return db
    .select({
      savedId: schema.savedSongs.id,
      song: schema.songs,
      createdAt: schema.savedSongs.createdAt,
    })
    .from(schema.savedSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.savedSongs.songId))
    .where(eq(schema.savedSongs.userId, userId))
    .orderBy(desc(schema.savedSongs.createdAt))
    .all();
}

export async function getSavedSongIds(userId: string): Promise<Set<number>> {
  const rows = await db
    .select({ songId: schema.savedSongs.songId })
    .from(schema.savedSongs)
    .where(eq(schema.savedSongs.userId, userId))
    .all();
  return new Set(rows.map((r) => r.songId));
}

export async function isSongSaved(
  userId: string,
  songId: number,
): Promise<boolean> {
  const row = await db
    .select({ id: schema.savedSongs.id })
    .from(schema.savedSongs)
    .where(
      and(
        eq(schema.savedSongs.userId, userId),
        eq(schema.savedSongs.songId, songId),
      ),
    )
    .get();
  return !!row;
}

export async function getRecommendation(
  userId: string,
  excludeSongIds: number[] = [],
) {
  const rankedSubquery = db
    .select({ songId: schema.rankings.songId })
    .from(schema.rankings)
    .where(eq(schema.rankings.userId, userId));

  const baseConditions = [
    notInArray(schema.songs.id, rankedSubquery),
    sql`NOT ${NOT_A_SONG_PATTERN}`,
  ];
  if (excludeSongIds.length) {
    baseConditions.push(notInArray(schema.songs.id, excludeSongIds));
  }

  // Truly random pick — features and deep cuts surface alongside primary tracks.
  return db
    .select()
    .from(schema.songs)
    .where(and(...baseConditions))
    .orderBy(sql`random()`)
    .limit(1)
    .get();
}
