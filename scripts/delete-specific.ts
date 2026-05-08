/**
 * One-off deletes for specific catalog mistakes the user flagged. Each
 * entry deletes a row matched by exact title + artist contains. Cascade
 * removes rankings for those rows.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { sql, and, eq, inArray } from "drizzle-orm";

type DeleteSpec = { exactTitle: string; artistContains: string };

const TARGETS: DeleteSpec[] = [
  // User wants to keep "Encore/Curtains Down" and drop the standalone
  // "Encore" — they're the same song, this is the cleaner row.
  { exactTitle: "Encore", artistContains: "Eminem" },
];

async function main() {
  const db = createDbClient();
  const idsToDrop: number[] = [];

  for (const t of TARGETS) {
    const matches = await db
      .select({
        id: schema.songs.id,
        title: schema.songs.title,
        artist: schema.songs.primaryArtist,
      })
      .from(schema.songs)
      .where(
        and(
          eq(schema.songs.title, t.exactTitle),
          sql`lower(${schema.songs.primaryArtist}) LIKE ${`%${t.artistContains.toLowerCase()}%`}`,
        ),
      )
      .all();
    for (const m of matches) {
      console.log(`  → drop #${m.id} "${m.title}" — ${m.artist}`);
      idsToDrop.push(m.id);
    }
  }

  if (idsToDrop.length === 0) {
    console.log("✓ Nothing to delete (already clean).");
    return;
  }

  await db.delete(schema.songs).where(inArray(schema.songs.id, idsToDrop)).run();
  console.log(`✓ Deleted ${idsToDrop.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
