/**
 * Manual title/album fixes for known catalog issues. Idempotent — safe to
 * re-run.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, sql, and } from "drizzle-orm";

type Fix =
  | {
      match: { titleLike: string; artist?: string };
      setTitle?: string;
      setAlbum?: string;
    }
  | {
      match: { exactTitle: string; artist?: string };
      setTitle?: string;
      setAlbum?: string;
    }
  | { match: { id: number }; setTitle?: string; setAlbum?: string };

const FIXES: Fix[] = [
  // 50 Cent ft Eminem — was stored mistitled. Match all variants
  // ("Impatiently Waiting", "Patiently Waiting (Chopped Not Slopped)", etc.)
  // and force the canonical title + album.
  {
    match: { titleLike: "%atiently Waiting%", artist: "50 Cent" },
    setTitle: "Patiently Waiting",
    setAlbum: "Get Rich or Die Tryin'",
  },
];

async function main() {
  const db = createDbClient();
  let applied = 0;
  for (const fix of FIXES) {
    let where;
    const m = fix.match as Record<string, unknown>;
    if ("id" in m) {
      where = eq(schema.songs.id, m.id as number);
    } else if ("exactTitle" in m) {
      const exactTitle = m.exactTitle as string;
      where = m.artist
        ? and(
            eq(schema.songs.title, exactTitle),
            sql`lower(${schema.songs.primaryArtist}) LIKE ${`%${(m.artist as string).toLowerCase()}%`}`,
          )!
        : eq(schema.songs.title, exactTitle);
    } else {
      // titleLike
      const pat = m.titleLike as string;
      where = m.artist
        ? and(
            sql`${schema.songs.title} LIKE ${pat}`,
            sql`lower(${schema.songs.primaryArtist}) LIKE ${`%${(m.artist as string).toLowerCase()}%`}`,
          )!
        : sql`${schema.songs.title} LIKE ${pat}`;
    }

    const set: Partial<typeof schema.songs.$inferInsert> = {};
    if (fix.setTitle) set.title = fix.setTitle;
    if (fix.setAlbum) set.album = fix.setAlbum;
    if (Object.keys(set).length === 0) continue;

    const res = await db.update(schema.songs).set(set).where(where).run();
    const affected = (res as { rowsAffected?: number }).rowsAffected ?? 0;
    if (affected) {
      const label =
        "id" in m
          ? `id=${m.id}`
          : "exactTitle" in m
            ? `title="${m.exactTitle}"`
            : `titleLike="${m.titleLike}"`;
      console.log(`  ✓ ${affected} row(s) updated`, label, "→", set);
      applied += affected;
    }
  }
  console.log(`Done. ${applied} fixes applied.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
