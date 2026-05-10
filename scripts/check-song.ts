import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { like } from "drizzle-orm";

async function main() {
  const db = createDbClient();
  const titles = ["Lady", "Psycho", "Bully", "The Warning"];
  for (const t of titles) {
    const rows = await db
      .select()
      .from(schema.songs)
      .where(like(schema.songs.title, t))
      .all();
    console.log(`\n"${t}":`);
    for (const r of rows) {
      console.log(
        `  #${r.id} primary="${r.primaryArtist}" feat=${JSON.stringify(r.featuredArtists)} role=${r.eminemRole} preview=${r.previewUrl ? "Y" : "N"}`,
      );
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
