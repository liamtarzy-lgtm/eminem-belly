/**
 * Auto-populates a default rap segment for every Eminem-primary song
 * that has audio but no validated segment yet. Default window is
 * 10–12s into the preview — Deezer/iTunes previews are typically a
 * 30-second cut starting partway through the song, so 10s in usually
 * lands past the intro fade and into vocals.
 *
 * Marked confidence: "auto" so the admin tool can distinguish these
 * from manually-validated windows. Honest tradeoff:
 *   - ~70-80% of these will be Eminem actively rapping
 *   - ~20-30% might land in a sung hook, instrumental break, or
 *     featured-artist section
 * Worth fixing the misses via /admin/segments later, but the game is
 * playable across the catalog after this script runs.
 *
 * Idempotent: only touches songs missing a segment.
 * Restricted to eminemRole=primary so we don't accidentally play a
 * featured artist's rap window as if it were Eminem.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { and, eq, sql, isNotNull, or } from "drizzle-orm";

const DEFAULT_START = 10;
const DEFAULT_END = 12;

async function main() {
  const force = process.argv.includes("--force");
  const db = createDbClient();

  const targets = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      previewUrl: schema.songs.previewUrl,
      deezerTrackId: schema.songs.deezerTrackId,
      segments: schema.songs.validatedRapSegments,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.eminemRole, "primary"),
        // Only songs with playable audio
        or(
          isNotNull(schema.songs.previewUrl),
          isNotNull(schema.songs.deezerTrackId),
        )!,
      ),
    )
    .all();

  const eligible = force
    ? targets
    : targets.filter((t) => t.segments.length === 0);

  console.log(
    `→ ${eligible.length} primary song${eligible.length === 1 ? "" : "s"} with audio${force ? " (forced)" : " missing a segment"}`,
  );

  let written = 0;
  for (const song of eligible) {
    const next = force
      ? [
          {
            start: DEFAULT_START,
            end: DEFAULT_END,
            confidence: "auto" as const,
          },
        ]
      : [
          ...song.segments,
          {
            start: DEFAULT_START,
            end: DEFAULT_END,
            confidence: "auto" as const,
          },
        ];
    await db
      .update(schema.songs)
      .set({ validatedRapSegments: next })
      .where(eq(schema.songs.id, song.id))
      .run();
    written++;
    if (written % 50 === 0) {
      process.stdout.write(`\r  ${written}/${eligible.length}`);
    }
  }
  process.stdout.write(`\r  ${written}/${eligible.length}\n`);
  console.log(`✓ Auto-segmented ${written} songs (${DEFAULT_START}-${DEFAULT_END}s window).`);
  console.log(
    `  Refine via /admin/segments if a song lands in a hook or instrumental.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
