/**
 * One-off inspection: dump current catalog state for cleanup planning.
 *   - Eminem Show albums + their tracks
 *   - Suspected dupes (by case-insensitive title within same album)
 *   - Skit candidates (title contains skit/interlude/intro/outro/dialogue)
 *   - Total counts by album
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { sql, like, or, and, isNull } from "drizzle-orm";

async function main() {
  const db = createDbClient();
  const all = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.primaryArtist,
      album: schema.songs.album,
      preview: schema.songs.previewUrl,
      role: schema.songs.eminemRole,
      releaseDate: schema.songs.releaseDate,
    })
    .from(schema.songs)
    .all();

  console.log(`TOTAL: ${all.length} songs\n`);

  // Eminem Show variants
  console.log("=== Eminem Show albums ===");
  const showRows = all.filter(
    (r) => r.album?.toLowerCase().includes("eminem show"),
  );
  const byAlbum = new Map<string, typeof showRows>();
  for (const r of showRows) {
    const key = r.album ?? "(null)";
    const arr = byAlbum.get(key) ?? [];
    arr.push(r);
    byAlbum.set(key, arr);
  }
  for (const [album, songs] of byAlbum) {
    console.log(`\n  ${album} (${songs.length})`);
    for (const s of songs.sort((a, b) => a.title.localeCompare(b.title))) {
      console.log(`    #${s.id} "${s.title}" — ${s.releaseDate ?? "no date"}`);
    }
  }

  // Skit candidates
  console.log("\n\n=== Skit / interlude candidates ===");
  const skitPattern = /(skit|interlude|dialogue|intro|outro|public service|news report|conversation|paul rosenberg|paul \(skit\)|em calls|interview|prelude|monologue)/i;
  const skits = all.filter((r) => skitPattern.test(r.title));
  for (const s of skits.sort((a, b) => (a.album ?? "").localeCompare(b.album ?? ""))) {
    console.log(`  #${s.id} "${s.title}" — ${s.album ?? "(no album)"}`);
  }
  console.log(`(${skits.length} candidates)`);

  // Cross-album dupes by normalized title (could be same song on multiple albums)
  console.log("\n\n=== Title appears on multiple albums (potential dupes) ===");
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s*\[[^\]]*\]\s*/g, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const titleGroups = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${norm(r.title)}|${r.role}`;
    const arr = titleGroups.get(k) ?? [];
    arr.push(r);
    titleGroups.set(k, arr);
  }
  let dupeCount = 0;
  for (const [k, songs] of titleGroups) {
    if (songs.length < 2) continue;
    dupeCount++;
    console.log(`\n  "${songs[0].title}" — ${songs[0].role}`);
    for (const s of songs) {
      console.log(
        `    #${s.id} ${s.album ?? "(no album)"} ${s.preview ? "🔊" : "  "} ${s.releaseDate ?? ""}`,
      );
    }
  }
  console.log(`(${dupeCount} title groups w/ multiple rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
