/**
 * Dump song_albums entries for Eminem Show variants and any potential
 * leakage between original/expanded.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { like, or, eq } from "drizzle-orm";

async function main() {
  const db = createDbClient();
  const rows = await db
    .select({
      songId: schema.songAlbums.songId,
      albumName: schema.songAlbums.albumName,
      title: schema.songs.title,
      songsAlbum: schema.songs.album,
    })
    .from(schema.songAlbums)
    .innerJoin(schema.songs, eq(schema.songAlbums.songId, schema.songs.id))
    .where(like(schema.songAlbums.albumName, "%Eminem Show%"))
    .all();

  const byAlbum = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byAlbum.get(r.albumName) ?? [];
    arr.push(r);
    byAlbum.set(r.albumName, arr);
  }
  for (const [album, list] of byAlbum) {
    console.log(`\n${album} (${list.length})`);
    for (const r of list.sort((a, b) => a.title.localeCompare(b.title))) {
      console.log(`  #${r.songId} "${r.title}" — songs.album="${r.songsAlbum}"`);
    }
  }

  // Cross-check: any song with songs.album = "Expanded Edition" but song_albums also pointing to original?
  console.log("\n=== Cross-check: songs whose songs.album is Expanded but linked to original ===");
  const expanded = rows.filter(
    (r) =>
      r.songsAlbum?.toLowerCase().includes("expanded") &&
      !r.albumName.toLowerCase().includes("expanded"),
  );
  for (const r of expanded) {
    console.log(`  #${r.songId} "${r.title}" — songs.album="${r.songsAlbum}", song_albums="${r.albumName}"`);
  }
  if (expanded.length === 0) console.log("  (none)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
