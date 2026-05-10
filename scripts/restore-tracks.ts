/**
 * Restore tracks that cleanup-v2 wrongly classified as skits. These have
 * "(Intro)" / "(Outro)" suffixes in their album titles but are real
 * Eminem-rap tracks, not skits/dialogue.
 *
 * Idempotent: skips inserts where the Deezer track id already exists.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { eq } from "drizzle-orm";

type DeezerTrack = {
  id: number;
  title: string;
  preview: string | null;
  duration: number;
  album: { id: number; title: string; cover_xl?: string; cover_big?: string };
  artist: { id: number; name: string };
};

const RESTORE: Array<{
  trackId: number;
  album: string;
  releaseDate: string;
}> = [
  { trackId: 854914262, album: "Music To Be Murdered By", releaseDate: "2020-01-17" }, // Premonition (Intro)
  { trackId: 854914362, album: "Music To Be Murdered By", releaseDate: "2020-01-17" }, // Stepdad (Intro)
  { trackId: 854914452, album: "Music To Be Murdered By", releaseDate: "2020-01-17" }, // Alfred (Outro)
  { trackId: 439484772, album: "Revival",                  releaseDate: "2017-12-15" }, // Remind Me (Intro)
  { trackId: 1176208,   album: "The Marshall Mathers LP",  releaseDate: "2000-05-23" }, // Amityville
];

async function fetchDeezer(id: number): Promise<DeezerTrack> {
  const res = await fetch(`https://api.deezer.com/track/${id}`);
  if (!res.ok) throw new Error(`Deezer ${res.status} for ${id}`);
  return (await res.json()) as DeezerTrack;
}

async function main() {
  const db = createDbClient();
  const existing = await db.select().from(schema.songs).all();
  const byDeezer = new Map<number, number>();
  for (const r of existing) {
    if (r.deezerTrackId !== null) byDeezer.set(r.deezerTrackId, r.id);
  }

  let restored = 0;
  for (const cfg of RESTORE) {
    if (byDeezer.has(cfg.trackId)) {
      console.log(`skip Deezer ${cfg.trackId} — already in DB`);
      continue;
    }
    const t = await fetchDeezer(cfg.trackId);
    // Strip the "(Album Version Explicit)" / "(Album Version)" suffixes
    // that Deezer sometimes adds to the title — they aren't part of the
    // canonical track name on the album.
    const cleanTitle = t.title.replace(
      /\s*\((album version|explicit|album version explicit)\)\s*$/i,
      "",
    );
    const inserted = await db
      .insert(schema.songs)
      .values({
        title: cleanTitle,
        primaryArtist: "Eminem",
        featuredArtists: [],
        album: cfg.album,
        releaseDate: cfg.releaseDate,
        artUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
        previewUrl: t.preview,
        deezerTrackId: t.id,
        durationMs: t.duration ? t.duration * 1000 : null,
        eminemRole: "primary",
      })
      .returning({ id: schema.songs.id })
      .all();
    const newId = inserted[0].id;
    console.log(`+ "${cleanTitle}" (#${newId}) — ${cfg.album}`);
    await db
      .insert(schema.songAlbums)
      .values({
        songId: newId,
        albumName: cfg.album,
        albumArtUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
        albumReleaseDate: cfg.releaseDate,
        isPrimary: true,
      })
      .onConflictDoNothing()
      .run();
    restored++;
  }

  console.log(`\n✓ Restored ${restored} tracks.`);

  // Auto-segment the restored primary tracks at the default 10-12s window
  // so they're playable in Game 1.
  if (restored > 0) {
    const newRows = await db
      .select({ id: schema.songs.id, segments: schema.songs.validatedRapSegments })
      .from(schema.songs)
      .all();
    let segged = 0;
    for (const r of newRows) {
      // Only segment rows whose deezer id is in our restore set AND segments empty
      const matchingCfg = RESTORE.find(
        (c) =>
          existing.find((e) => e.deezerTrackId === c.trackId) === undefined,
      );
      if (!matchingCfg) continue;
      // (cheap path) - just look at all rows and segment any with empty segments
      // among the just-restored ones; the dedicated auto-segment script handles
      // bulk cases, this is just for the 5 we restored.
    }
    // Simpler: just run a SQL update for these specific deezer ids
    const ids = RESTORE.map((c) => c.trackId);
    for (const tid of ids) {
      const row = await db
        .select({
          id: schema.songs.id,
          segments: schema.songs.validatedRapSegments,
        })
        .from(schema.songs)
        .where(eq(schema.songs.deezerTrackId, tid))
        .all();
      for (const r of row) {
        if (r.segments.length === 0) {
          await db
            .update(schema.songs)
            .set({
              validatedRapSegments: [
                { start: 10, end: 12, confidence: "auto" },
              ],
            })
            .where(eq(schema.songs.id, r.id))
            .run();
          segged++;
        }
      }
    }
    console.log(`✓ Auto-segmented ${segged} restored tracks for Game 1.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
