/**
 * Aggressive cleanup of deep-cut / bootleg / a cappella / mashup junk that
 * shouldn't be in the rankable catalog. Deletes rows that match clear junk
 * patterns. Cascade also removes any rankings/comparisons/saved/song_albums
 * referencing deleted rows — user explicitly OK'd this.
 *
 * Conservative: only deletes rows that look obviously bootleg-ish (DJ
 * mixes, mashups, a cappella, sketchy freestyles) AND aren't on a real
 * album. Songs on canonical Eminem albums never get touched.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { inArray, sql } from "drizzle-orm";

// Title patterns that mark obvious junk. Conservative — only matches
// clear bootleg signals.
const JUNK_TITLE_PATTERNS: RegExp[] = [
  / vs\.? /i, // "Lose Yourself vs Stronger" — mashups
  /\//, // "/" mashups (Sliced Tomatoes / My Name Is)
  /\(a\s?cappella\)/i,
  /\(a cappella\)/i,
  /a cappella/i,
  /\(c[‐\-]?squared\s+mix\)/i,
  /\(dj\s+\w+\s+(mix|remix)\)/i,
  /\(slowed\s+(?:'?n'?|and|n)\s+(?:throwed|chopped)\)/i,
  /\(chopped\s+(?:n|not)\s+slopped\)/i,
  /screamixx/i,
  /\(steelie\s+mix\)/i,
  /\(worldwide\s+mix\)/i,
  /\(smu\s+mix\)/i,
  /\(2001\s+club\s+mix\)/i,
  /\bb\.e\.t\.\s+shady/i,
  /chopped\s+not\s+slopped/i,
  /\b(rmx)\b/i,
  /\(dihnjo\s+mix\)/i,
  /\(dj\s+veli\s+mix\)/i,
  /\(dj\s+euphonious\s+mix\)/i,
  /\(dj\s+marcy\s+marc\s+mix\)/i,
  /\(dj\s+ridah\s+mix\)/i,
  /\(dj\s+haze\s+mix\)/i,
  /\(dj\s+henny\s+mix\)/i,
  /\(dj\s+unreal\s+mix\)/i,
  /\(dj\s+smith\s+&\s+wesson\)/i,
  /\(unreleased\s+exclusive/i,
  /shade\s+45\s+freestyle/i,
  /wake\s+up\s+show\s+freestyle/i,
];

// Specific junk titles by exact match (manual additions when patterns
// can't catch them cleanly).
const JUNK_TITLES_EXACT = new Set<string>([
  "Renegades (intro)",
  "Renegades of Funk / Just Lose it",
  "Remembering Makaveli (intro)",
  "Numb Encore",
  "Frontpage Stardom",
  "Recury / Without me (acapella) / Without me",
  "The Bad, the Sad & The Hated",
]);

function isJunkTitle(title: string): boolean {
  if (JUNK_TITLES_EXACT.has(title)) return true;
  return JUNK_TITLE_PATTERNS.some((p) => p.test(title));
}

async function main() {
  const db = createDbClient();
  const all = await db.select().from(schema.songs).all();

  // Conservative filter: only delete if (junk pattern matches) AND
  // (album is null OR no preview AND eminemRole = feature). This protects
  // anything that's on a real Eminem album.
  const toDelete = all.filter((s) => {
    if (!isJunkTitle(s.title)) return false;
    // Be extra safe: if it has a real album set, leave it
    if (s.album) return false;
    return true;
  });

  console.log(`Examined ${all.length} songs. Targeting ${toDelete.length} for deletion:`);
  for (const s of toDelete.slice(0, 40)) {
    console.log(`  - "${s.title}" — ${s.primaryArtist}`);
  }
  if (toDelete.length > 40) console.log(`  …and ${toDelete.length - 40} more`);

  if (toDelete.length === 0) {
    console.log("✓ Nothing to clean up.");
    return;
  }

  console.log(`\nDeleting ${toDelete.length}...`);
  const ids = toDelete.map((s) => s.id);
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await db.delete(schema.songs).where(inArray(schema.songs.id, batch)).run();
  }

  const remaining = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.songs)
    .get();
  console.log(`✓ Removed ${toDelete.length}. Catalog now has ${remaining?.n ?? 0} songs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
