/**
 * Round 2 cleanup: skits, dupes, and Eminem Show original/expanded leakage.
 *
 *  1) Skits / interludes / intros / outros: cull rows whose title matches a
 *     skit pattern. Cascade deletes.
 *  2) Eminem Show separation: the 4 bonus tracks (Bump Heads, Stimulate,
 *     Jimmy/Brian/Mike, The Conspiracy Freestyle) are linked to BOTH
 *     "The Eminem Show" and "(Expanded Edition)" in song_albums — the
 *     duplicate link to the original album is what's causing them to show
 *     up where they shouldn't. Drop just those song_albums rows.
 *  3) Smarter dedup: normalize "U" → "you", strip remaster/edit/remix tags,
 *     and dedupe across albums (preferring the row with album + preview).
 *
 * All deletes cascade through to rankings/comparisons/saved_songs/song_albums.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { and, eq, inArray, like, or } from "drizzle-orm";

// IMPORTANT: do NOT add "(Intro)" / "(Outro)" suffixed titles here unless
// you've verified they're actual dialogue/skit (not a real Eminem rap with
// an "Intro" suffix in the official tracklist). Premonition (Intro),
// Stepdad (Intro), Remind Me (Intro), Alfred (Outro), and Amityville are
// all real songs with rapping — NOT skits.
const SKIT_TITLES = new Set([
  "outro",
  "intro",
  "shock the people (intro)",
  "another public service announcement (intro)",
  "public service announcement 2000",
  "public service announcement",
  "curtains up (skit)",
  "the kiss (skit)",
  "paul rosenberg (skit)",
  "steve berman (skit)",
  "ken kaniff (skit)",
  "ken kaniff",
  "interlude",
  "skit",
]);

const SKIT_PATTERNS: RegExp[] = [
  /\(skit\)$/i,
  /\(interlude\)$/i,
  /\(prelude\)$/i,
  /^(intro|outro)$/i,
  /^(another )?public service announcement/i,
];

function normalizeTitleStrong(s: string): string {
  let n = s
    .toLowerCase()
    // censor expansion
    .replace(/\bf\*+/g, "fuck")
    .replace(/\bs\*+/g, "shit")
    .replace(/\bb\*+/g, "bitch")
    .replace(/\bn\*+/g, "nigga")
    // text-speak normalization (only as standalone words)
    .replace(/\bu\b/g, "you")
    .replace(/\b(2|to)\b/g, "to")
    .replace(/\b(4|for)\b/g, "for")
    .replace(/[‘’`´']/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // strip trailing version words
  n = n.replace(
    /\s+(remix|edit|version|remaster(ed)?|live|acoustic|mix|reprise|extended)$/i,
    "",
  );
  return n;
}

function normalizeArtistStrong(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/\s+(featuring|feat\.?|ft\.?|with|&|and|x|vs\.?)\s+.*$/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = typeof schema.songs.$inferSelect;

function score(row: Row): number {
  let s = 0;
  if (row.previewUrl) s += 8;
  if (row.album) s += 4;
  if (row.artUrl) s += 2;
  if (row.deezerTrackId !== null) s += 1;
  return s;
}

async function main() {
  const db = createDbClient();

  // ─── 1. Skit removal ─────────────────────────────────────────────────
  const all = await db.select().from(schema.songs).all();
  const skitTargets = all.filter((r) => {
    const t = r.title.toLowerCase().trim();
    if (SKIT_TITLES.has(t)) return true;
    if (SKIT_PATTERNS.some((p) => p.test(r.title))) return true;
    return false;
  });
  console.log(`Skits to remove: ${skitTargets.length}`);
  for (const s of skitTargets) {
    console.log(`  #${s.id} "${s.title}" — ${s.album ?? "(no album)"}`);
  }
  if (skitTargets.length > 0) {
    const ids = skitTargets.map((s) => s.id);
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      await db
        .delete(schema.songs)
        .where(inArray(schema.songs.id, ids.slice(i, i + BATCH)))
        .run();
    }
    console.log(`✓ Removed ${ids.length} skits`);
  }

  // ─── 2. Eminem Show original ↔ expanded leakage ──────────────────────
  // Anything whose songs.album = "The Eminem Show (Expanded Edition)"
  // should NOT also be linked to "The Eminem Show" in song_albums.
  console.log("\nFixing Eminem Show original/expanded leakage...");
  const expandedSongs = await db
    .select({ id: schema.songs.id, title: schema.songs.title })
    .from(schema.songs)
    .where(eq(schema.songs.album, "The Eminem Show (Expanded Edition)"))
    .all();
  console.log(`  ${expandedSongs.length} expanded-edition songs:`);
  for (const s of expandedSongs) console.log(`    #${s.id} ${s.title}`);
  if (expandedSongs.length > 0) {
    const ids = expandedSongs.map((s) => s.id);
    const result = await db
      .delete(schema.songAlbums)
      .where(
        and(
          inArray(schema.songAlbums.songId, ids),
          eq(schema.songAlbums.albumName, "The Eminem Show"),
        ),
      )
      .run();
    console.log(
      `✓ Cleared ${(result as unknown as { rowsAffected?: number }).rowsAffected ?? "?"} bad song_albums links`,
    );
  }

  // ─── 3. Smarter dedup ────────────────────────────────────────────────
  const remaining = await db.select().from(schema.songs).all();
  console.log(`\nDeduping across ${remaining.length} songs...`);
  const groups = new Map<string, Row[]>();
  for (const row of remaining) {
    const t = normalizeTitleStrong(row.title);
    if (!t) continue;
    const a = normalizeArtistStrong(row.primaryArtist);
    const key = `${t}|${a}|${row.eminemRole}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  const toDelete: number[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const sd = score(b) - score(a);
      if (sd !== 0) return sd;
      return a.id - b.id;
    });
    const keeper = group[0];
    const losers = group.slice(1);
    console.log(
      `  keep #${keeper.id} "${keeper.title}" (${keeper.album ?? "no album"}); drop ${losers
        .map((l) => `#${l.id}(${l.album ?? "no album"})`)
        .join(", ")}`,
    );
    toDelete.push(...losers.map((l) => l.id));
  }
  if (toDelete.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      await db
        .delete(schema.songs)
        .where(inArray(schema.songs.id, toDelete.slice(i, i + BATCH)))
        .run();
    }
    console.log(`✓ Removed ${toDelete.length} duplicate rows`);
  } else {
    console.log("  no duplicates");
  }

  const final = await db.select({ id: schema.songs.id }).from(schema.songs).all();
  console.log(`\n→ Catalog now ${final.length} songs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
