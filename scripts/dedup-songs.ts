/**
 * Collapse duplicate songs in the catalog. Two rows are considered the same
 * song if their (normalized title, normalized primary artist) match. The
 * "best" row in each group is kept; the others are deleted.
 *
 * "Best" priority (descending):
 *   1. Has a preview URL
 *   2. Has album art
 *   3. Has a non-null album field
 *   4. Has a deezer track id
 *   5. Lower id (= older row, more likely the canonical one)
 *
 * Cascade deletes also drop rankings/comparisons/saved/song_albums for the
 * removed rows. User OK'd this loss.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { inArray, eq } from "drizzle-orm";

function normalizeTitle(s: string): string {
  let n = s
    .toLowerCase()
    // Common censorship → expand back to match the uncensored spelling so
    // "Just Don't Give A Fuck" and "Just Don't Give a F**" collapse.
    .replace(/\bf\*+/g, "fuck")
    .replace(/\bs\*+/g, "shit")
    .replace(/\bb\*+/g, "bitch")
    .replace(/\bn\*+/g, "nigga")
    .replace(/\bp\*+/g, "pussy")
    .replace(/\ba\*+/g, "ass");
  n = n
    .replace(/[‘’`´']/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n;
}

function normalizeArtist(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/\s+(featuring|feat\.?|ft\.?|with|&|and|x)\s+.*$/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = typeof schema.songs.$inferSelect;

function score(row: Row): number {
  let s = 0;
  if (row.previewUrl) s += 8;
  if (row.artUrl) s += 4;
  if (row.album) s += 2;
  if (row.deezerTrackId !== null) s += 1;
  return s;
}

async function main() {
  const db = createDbClient();
  const all = await db.select().from(schema.songs).all();
  console.log(`Examining ${all.length} songs for duplicates...`);

  const groups = new Map<string, Row[]>();
  for (const row of all) {
    const key = `${normalizeTitle(row.title)}|${normalizeArtist(row.primaryArtist)}`;
    if (!key.split("|")[0]) continue; // empty title after normalize
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  const dupes: Row[][] = [];
  for (const grp of groups.values()) {
    if (grp.length > 1) dupes.push(grp);
  }
  console.log(`Found ${dupes.length} groups with duplicates.`);

  let toDelete: number[] = [];
  for (const group of dupes) {
    // Sort by score desc, lower id breaks ties
    group.sort((a, b) => {
      const sd = score(b) - score(a);
      if (sd !== 0) return sd;
      return a.id - b.id;
    });
    const keeper = group[0];
    const losers = group.slice(1);
    console.log(
      `  keep #${keeper.id} "${keeper.title}" — ${keeper.primaryArtist} (score ${score(keeper)}); drop ${losers.map((l) => `#${l.id}`).join(", ")}`,
    );
    toDelete.push(...losers.map((l) => l.id));
  }

  if (toDelete.length === 0) {
    console.log("✓ No duplicates to remove.");
    return;
  }

  console.log(`\nDeleting ${toDelete.length} duplicate rows...`);
  const BATCH = 50;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    await db.delete(schema.songs).where(inArray(schema.songs.id, batch)).run();
  }
  console.log(`✓ Removed ${toDelete.length} duplicates.`);

  // Quick sanity: print remaining count
  const remaining = await db.select({ id: schema.songs.id }).from(schema.songs).all();
  console.log(`  catalog now has ${remaining.length} songs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
