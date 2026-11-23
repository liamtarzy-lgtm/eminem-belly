/**
 * Remove catalog songs that Eminem isn't actually on (e.g. "Instigator").
 *
 * These leaked in from compilations (The Re-Up, Shady XV, soundtracks) and
 * from MusicBrainz credits where Eminem was producer, not performer.
 *
 * Two parts:
 *   - SUSPECTS (report only): non-Eminem-primary songs whose Deezer
 *     contributor list lacks Eminem (Deezer artist 13). Deezer's feature
 *     credits are incomplete — e.g. T.I.'s "That's All She Wrote" and
 *     "Touchdown" both feature Eminem but Deezer only credits T.I. — so
 *     suspects are NEVER auto-deleted. Review the list, then pass the bad
 *     ones via --ids.
 *   - DELETE: songs whose title is in FORCE_TITLES, plus any --ids.
 *
 * Usage:
 *   npx tsx scripts/prune-no-eminem.ts                     # report only
 *   npx tsx scripts/prune-no-eminem.ts --ids 2534,2548     # report incl. ids
 *   npx tsx scripts/prune-no-eminem.ts --apply [--ids ...] # delete + compact
 *
 * Deleting a song cascades to rankings/comparisons/saved/song_albums. After
 * deleting, every affected user's ranking positions are renumbered 1..N so
 * the binary-search insertion (which assumes contiguous positions) keeps
 * working.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { asc, eq, inArray, sql } from "drizzle-orm";

const EMINEM_DEEZER_ID = 13;
const EMINEM_ACTS = new Set(["eminem", "bad meets evil"]);
// D12 tracks almost always have Eminem but Deezer credits only "D12".
const REVIEW_GROUPS = new Set(["d12"]);

const FORCE_TITLES = new Set(["instigator"]);

const APPLY = process.argv.includes("--apply");
const idsArg = process.argv[process.argv.indexOf("--ids") + 1];
const EXTRA_IDS = new Set(
  process.argv.includes("--ids") && idsArg
    ? idsArg.split(",").map((s) => Number(s.trim()))
    : [],
);

const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’'`]/g, "").replace(/\s+/g, " ").trim();

type Contributor = { id: number; name: string };

async function deezerContributors(
  trackId: number,
): Promise<Contributor[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://api.deezer.com/track/${trackId}`);
    } catch {
      // network hiccup (ECONNRESET etc.) — back off and retry
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as {
        contributors?: Contributor[];
        error?: { code: number };
      };
      if (body.error?.code === 4) {
        // quota — back off and retry
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (body.error) return null;
      return body.contributors ?? [];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function main() {
  const db = createDbClient();
  const songs = await db.select().from(schema.songs).all();
  const rankedCounts = new Map<number, number>();
  for (const r of await db
    .select({ songId: schema.rankings.songId })
    .from(schema.rankings)
    .all()) {
    rankedCounts.set(r.songId, (rankedCounts.get(r.songId) ?? 0) + 1);
  }

  const toDelete: Array<{ song: (typeof songs)[number]; reason: string }> = [];
  const review: Array<{ song: (typeof songs)[number]; reason: string }> = [];
  let unverifiable = 0;

  for (const song of songs) {
    const primary = norm(song.primaryArtist);
    if (FORCE_TITLES.has(norm(song.title)) || EXTRA_IDS.has(song.id)) {
      toDelete.push({ song, reason: "flagged by hand" });
      continue;
    }
    if (EMINEM_ACTS.has(primary)) continue;

    if (!song.deezerTrackId) {
      unverifiable++;
      continue;
    }

    const contributors = await deezerContributors(song.deezerTrackId);
    await new Promise((r) => setTimeout(r, 120)); // stay under Deezer's 50 req/5s
    if (contributors === null) {
      review.push({ song, reason: "Deezer lookup failed" });
      continue;
    }
    const hasEminem = contributors.some(
      (c) => c.id === EMINEM_DEEZER_ID || norm(c.name) === "eminem",
    );
    if (hasEminem) continue;

    const credits = contributors.map((c) => c.name).join(", ") || "(none)";
    review.push({
      song,
      reason: `${REVIEW_GROUPS.has(primary) ? "group track (likely fine), " : ""}Deezer credits: ${credits}`,
    });
  }

  const fmt = (s: (typeof songs)[number], reason: string) =>
    `  #${s.id}  ${s.title} — ${s.primaryArtist}` +
    `${s.album ? ` [${s.album}]` : ""}` +
    `  (${rankedCounts.get(s.id) ?? 0} users ranked)  ← ${reason}`;

  console.log(`\n=== WILL DELETE (${toDelete.length}) ===`);
  for (const { song, reason } of toDelete) console.log(fmt(song, reason));
  console.log(`\n=== SUSPECTS — review, NOT deleted unless passed via --ids (${review.length}) ===`);
  for (const { song, reason } of review) console.log(fmt(song, reason));
  console.log(
    `\n(${unverifiable} non-Eminem-primary songs have no Deezer id and were not checked.)`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }
  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const ids = toDelete.map((d) => d.song.id);
  const affectedUsers = [
    ...new Set(
      (
        await db
          .select({ userId: schema.rankings.userId })
          .from(schema.rankings)
          .where(inArray(schema.rankings.songId, ids))
          .all()
      ).map((r) => r.userId),
    ),
  ];

  await db.delete(schema.songs).where(inArray(schema.songs.id, ids)).run();
  console.log(`\nDeleted ${ids.length} songs.`);

  // Compact positions for each affected user: 1..N in existing order.
  for (const userId of affectedUsers) {
    const rows = await db
      .select({ id: schema.rankings.id })
      .from(schema.rankings)
      .where(eq(schema.rankings.userId, userId))
      .orderBy(asc(schema.rankings.position))
      .all();
    await db.transaction(async (tx) => {
      // Negate first to dodge the (user_id, position) unique index.
      await tx.run(
        sql`UPDATE rankings SET position = -position WHERE user_id = ${userId}`,
      );
      for (let i = 0; i < rows.length; i++) {
        await tx
          .update(schema.rankings)
          .set({ position: i + 1 })
          .where(eq(schema.rankings.id, rows[i].id))
          .run();
      }
    });
    console.log(`  compacted ${rows.length} rankings for user ${userId}`);
  }

  // Any in-flight insertion session for these users has low/high bounds
  // computed against the old positions — abandon them so the next visit
  // starts fresh.
  if (affectedUsers.length) {
    await db
      .update(schema.insertionSessions)
      .set({ status: "abandoned", completedAt: new Date() })
      .where(
        sql`${schema.insertionSessions.status} = 'active' AND ${inArray(
          schema.insertionSessions.userId,
          affectedUsers,
        )}`,
      )
      .run();
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
