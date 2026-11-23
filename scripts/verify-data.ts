/**
 * Confirm user history is intact after all the cleanup + redeploys.
 * Prints counts + a per-user summary of rankings/saved/comparisons.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq, sql } from "drizzle-orm";

async function main() {
  const db = createDbClient();

  const users = await db.select().from(schema.users).all();
  console.log(`\n=== USERS: ${users.length} ===`);
  for (const u of users) {
    console.log(`  ${u.email ?? "(no email)"} — id=${u.id} created=${u.createdAt}`);
  }

  const rankings = await db.select({ userId: schema.rankings.userId }).from(schema.rankings).all();
  const saved = await db.select({ userId: schema.savedSongs.userId }).from(schema.savedSongs).all();
  const comparisons = await db.select({ userId: schema.comparisons.userId }).from(schema.comparisons).all();
  const sessions = await db.select({ userId: schema.insertionSessions.userId }).from(schema.insertionSessions).all();
  const songs = await db.select({ id: schema.songs.id }).from(schema.songs).all();

  console.log(`\n=== TOTALS ===`);
  console.log(`  Songs in catalog: ${songs.length}`);
  console.log(`  Rankings: ${rankings.length}`);
  console.log(`  Saved: ${saved.length}`);
  console.log(`  Comparisons: ${comparisons.length}`);
  console.log(`  Insertion sessions: ${sessions.length}`);

  console.log(`\n=== PER USER ===`);
  for (const u of users) {
    const r = rankings.filter((x) => x.userId === u.id).length;
    const s = saved.filter((x) => x.userId === u.id).length;
    const c = comparisons.filter((x) => x.userId === u.id).length;
    const is = sessions.filter((x) => x.userId === u.id).length;
    console.log(
      `  ${u.email}: ${r} rankings, ${s} saved, ${c} comparisons, ${is} sessions`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
