/**
 * Killer vs. Killer (Remix).
 *
 * The catalog's "Killer" row pointed at Deezer track 1386509082, which is
 * actually "Killer (Remix)" (ft. Jack Harlow & Cordae) — the "(Remix)" tag
 * got stripped by an earlier dedup pass, so the remix never showed up as
 * its own song and "Killer" played the remix preview.
 *
 *   1. Repoint the existing "Killer" row (MTBMB Side B Deluxe) at the
 *      original solo track, 1182497012. Users' rankings of it are kept.
 *   2. Insert "Killer (Remix)" as a new song.
 *
 * Idempotent. Usage: npx tsx scripts/fix-killer-remix.ts
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { and, eq } from "drizzle-orm";

const ORIGINAL_DEEZER_ID = 1182497012;
const REMIX_DEEZER_ID = 1386509082;

type DeezerTrack = {
  id: number;
  title: string;
  preview: string | null;
  duration: number;
  release_date: string;
  album: { title: string; cover_xl?: string; cover_big?: string };
};

async function fetchTrack(id: number): Promise<DeezerTrack> {
  const res = await fetch(`https://api.deezer.com/track/${id}`);
  if (!res.ok) throw new Error(`Deezer ${res.status} for ${id}`);
  return (await res.json()) as DeezerTrack;
}

async function main() {
  const db = createDbClient();
  const [original, remix] = await Promise.all([
    fetchTrack(ORIGINAL_DEEZER_ID),
    fetchTrack(REMIX_DEEZER_ID),
  ]);

  // ── 1. Fix the original "Killer" row ─────────────────────────────────
  const killerRows = await db
    .select()
    .from(schema.songs)
    .where(
      and(eq(schema.songs.title, "Killer"), eq(schema.songs.primaryArtist, "Eminem")),
    )
    .all();
  if (killerRows.length === 0) {
    console.log("! No existing 'Killer' row found — skipping repoint.");
  }
  for (const row of killerRows) {
    if (row.deezerTrackId === ORIGINAL_DEEZER_ID) {
      console.log(`= "Killer" #${row.id} already points at the original.`);
      continue;
    }
    await db
      .update(schema.songs)
      .set({
        deezerTrackId: ORIGINAL_DEEZER_ID,
        previewUrl: original.preview,
        durationMs: original.duration * 1000,
        artUrl: original.album.cover_xl ?? original.album.cover_big ?? row.artUrl,
      })
      .where(eq(schema.songs.id, row.id))
      .run();
    console.log(
      `~ "Killer" #${row.id}: deezer ${row.deezerTrackId} → ${ORIGINAL_DEEZER_ID}`,
    );
  }

  // ── 2. Add "Killer (Remix)" ──────────────────────────────────────────
  const existingRemix = await db
    .select({ id: schema.songs.id })
    .from(schema.songs)
    .where(eq(schema.songs.title, "Killer (Remix)"))
    .get();
  if (existingRemix) {
    console.log(`= "Killer (Remix)" already exists (#${existingRemix.id}).`);
    return;
  }

  const art = remix.album.cover_xl ?? remix.album.cover_big ?? null;
  const [inserted] = await db
    .insert(schema.songs)
    .values({
      title: "Killer (Remix)",
      primaryArtist: "Eminem",
      featuredArtists: ["Jack Harlow", "Cordae"],
      album: "Killer (Remix)",
      releaseDate: remix.release_date,
      artUrl: art,
      previewUrl: remix.preview,
      deezerTrackId: REMIX_DEEZER_ID,
      durationMs: remix.duration * 1000,
      eminemRole: "primary",
    })
    .returning({ id: schema.songs.id })
    .all();
  // No song_albums row: singles aren't albums (see seed.ts).
  console.log(`+ "Killer (Remix)" — Eminem ft. Jack Harlow & Cordae (#${inserted.id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
