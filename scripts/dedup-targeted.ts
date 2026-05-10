/**
 * Targeted dedup of feature-track rows that auto-dedup missed because
 * primary artist names varied across rows ("JAŸ-Z" vs "JAY Z",
 * "Notorious B.I.G." vs "The Notorious B.I.G.", typos, etc.).
 *
 * Each entry: drop these IDs, then patch keepers' artist fields where needed.
 * Cascade deletes through rankings/saved/song_albums.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, inArray } from "drizzle-orm";

// IDs to delete — picked after manual inspection so we don't merge two
// songs that share a title but are genuinely different recordings.
const DROP_IDS = [
  229, // "3hree6ix5ive" typo "OldWorlDisorder" — keep #231 (clean)
  275, // "Dead Wrong" misattributed to Dr. Dre — keep #274 (Notorious B.I.G., preview)
  276, // "Dead Wrong" without "The" prefix dupe of #274
  344, // "If I Get Locked Up" misattributed to Dr. Dre — keep #345 (Funkmaster Flex)
  348, // "If I Get Locked Up" 2024 reupload — keep #345 (1999 original)
  397, // "Nuttin' to Do" Bad Meets Evil dupe — keep #402 (Royce, preview)
  407, // "One Day at a Time" Outlawz dupe — keep #410 (Tupac, has date)
  408, // "One Day at a Time" 2Pac dupe — keep #410
  429, // "Renegade" no-album — keep #184 (Curtain Call)
  502, // "Trife Thieves" D-12 reissue — keep #499 (Bizarre 1998 original)
  513, // "We All Die One Day" 50 Cent dupe — keep #515 (Obie Trice original)
  525, // "We All Die Someday" G-Unit reissue — keep #520 (Obie Trice 2002)
  528, // "What the Beat" Royce dupe — keep #527 (DJ Clue original w/ preview)
  533, // "What the Beat" Method Man dupe — keep #527
];

// Patches to apply to surviving rows: fix mojibake/typo'd artist fields.
const PATCHES: Array<{ id: number; primaryArtist?: string }> = [
  { id: 184, primaryArtist: "JAY-Z" }, // was JAŸ-Z
  { id: 410, primaryArtist: "2Pac" },  // canonical spelling
  { id: 274, primaryArtist: "The Notorious B.I.G." },
  { id: 231, primaryArtist: "Old World Disorder" },
];

async function main() {
  const db = createDbClient();
  console.log(`Deleting ${DROP_IDS.length} duplicate rows...`);
  const BATCH = 50;
  for (let i = 0; i < DROP_IDS.length; i += BATCH) {
    await db
      .delete(schema.songs)
      .where(inArray(schema.songs.id, DROP_IDS.slice(i, i + BATCH)))
      .run();
  }
  console.log("✓ Deleted.");

  console.log(`Patching ${PATCHES.length} kept rows...`);
  for (const p of PATCHES) {
    if (p.primaryArtist) {
      await db
        .update(schema.songs)
        .set({ primaryArtist: p.primaryArtist })
        .where(eq(schema.songs.id, p.id))
        .run();
      console.log(`  #${p.id} primaryArtist → "${p.primaryArtist}"`);
    }
  }
  console.log("✓ Patched.");

  const remaining = await db.select({ id: schema.songs.id }).from(schema.songs).all();
  console.log(`\n→ Catalog now ${remaining.length} songs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
