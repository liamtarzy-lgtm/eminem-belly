/**
 * Show full artist info for the remaining feature-track dupes so we can
 * decide which to merge.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { inArray } from "drizzle-orm";

const ids = [
  184, 429, 229, 231, 274, 275, 276, 309, 311, 344, 345, 348, 397, 402,
  399, 404, 407, 408, 410, 420, 425, 499, 502, 513, 515, 520, 525, 527,
  528, 533, 529, 530,
];

async function main() {
  const db = createDbClient();
  const rows = await db
    .select()
    .from(schema.songs)
    .where(inArray(schema.songs.id, ids))
    .all();
  for (const r of rows.sort((a, b) =>
    a.title.localeCompare(b.title) || a.id - b.id,
  )) {
    console.log(
      `#${r.id} "${r.title}" — primary="${r.primaryArtist}" feat=${JSON.stringify(r.featuredArtists)} album=${r.album ?? "—"} preview=${r.previewUrl ? "Y" : "N"} date=${r.releaseDate ?? "—"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
