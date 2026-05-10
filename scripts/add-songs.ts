/**
 * Add specific tracks the user requested:
 *   - Lady (Obie Trice ft. Eminem) — Cheers (2003), feature
 *   - Psycho (50 Cent ft. Eminem) — Before I Self-Destruct (2009), feature
 *   - A handful of unreleased Eminem diss tracks (Bully, Can-I-Bitch,
 *     The Warning, Quitter, Nail in the Coffin, Doe Rae Me, Big Weenie)
 *
 * For Deezer-available tracks, fetch real metadata + preview.
 * For unreleased disses, hardcode entries (no preview, no art).
 *
 * Idempotent: skips inserts where deezer_track_id or
 * (normalized title + role + primary artist) already exists.
 */
import { createDbClient } from "../src/db/client";
import { schema } from "../src/db";
import { and, eq, or } from "drizzle-orm";

type DeezerTrack = {
  id: number;
  title: string;
  preview: string | null;
  duration: number;
  album: { id: number; title: string; cover_xl?: string; cover_big?: string };
  artist: { id: number; name: string };
};

const FROM_DEEZER: Array<{
  trackId: number;
  album: string;
  releaseDate: string;
  primaryArtist: string;
  featuredArtists: string[];
  forceTitle?: string;
}> = [
  {
    trackId: 2231819, // Lady — Obie Trice
    album: "Cheers",
    releaseDate: "2003-09-23",
    primaryArtist: "Obie Trice",
    featuredArtists: ["Eminem"],
    forceTitle: "Lady",
  },
  {
    trackId: 7276777, // Psycho — 50 Cent
    album: "Before I Self-Destruct",
    releaseDate: "2009-11-09",
    primaryArtist: "50 Cent",
    featuredArtists: ["Eminem"],
    forceTitle: "Psycho",
  },
];

// Famous unreleased diss tracks. No preview, no art — they're freestyles
// that aren't on streaming. Still rankable from name/reputation.
const MANUAL_DISSES: Array<{
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  album: string | null;
  releaseDate: string;
}> = [
  {
    title: "Bully",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Singles & Loosies",
    releaseDate: "2003-01-01",
  },
  {
    title: "Can-I-Bitch",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Singles & Loosies",
    releaseDate: "2003-01-01",
  },
  {
    title: "The Warning",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Singles & Loosies",
    releaseDate: "2009-08-01",
  },
  {
    title: "Quitter",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Singles & Loosies",
    releaseDate: "2000-01-01",
  },
  {
    title: "Nail in the Coffin",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Singles & Loosies",
    releaseDate: "2003-01-01",
  },
  {
    title: "Doe Rae Me (Hailie's Revenge)",
    primaryArtist: "D12",
    featuredArtists: ["Eminem", "Obie Trice"],
    album: "Singles & Loosies",
    releaseDate: "2003-01-01",
  },
  {
    title: "Big Weenie",
    primaryArtist: "Eminem",
    featuredArtists: [],
    album: "Encore",
    releaseDate: "2004-11-12",
  },
];

async function fetchDeezerTrack(id: number): Promise<DeezerTrack> {
  const res = await fetch(`https://api.deezer.com/track/${id}`);
  if (!res.ok) throw new Error(`Deezer ${res.status} for track ${id}`);
  return (await res.json()) as DeezerTrack;
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const db = createDbClient();
  const existing = await db.select().from(schema.songs).all();
  const byDeezer = new Map<number, number>();
  const byKey = new Map<string, number>();
  for (const r of existing) {
    if (r.deezerTrackId !== null) byDeezer.set(r.deezerTrackId, r.id);
    const k = `${normTitle(r.title)}|${r.eminemRole}|${normTitle(r.primaryArtist)}`;
    byKey.set(k, r.id);
  }

  let inserted = 0;
  let skipped = 0;

  // ── Deezer-sourced tracks ─────────────────────────────────────────────
  for (const cfg of FROM_DEEZER) {
    if (byDeezer.has(cfg.trackId)) {
      console.log(`skip "${cfg.forceTitle}" — Deezer ${cfg.trackId} already in DB`);
      skipped++;
      continue;
    }
    try {
      const t = await fetchDeezerTrack(cfg.trackId);
      const title = cfg.forceTitle ?? t.title;
      const k = `${normTitle(title)}|feature|${normTitle(cfg.primaryArtist)}`;
      if (byKey.has(k)) {
        console.log(`skip "${title}" — already present by title/artist match`);
        skipped++;
        continue;
      }
      const inserted_ = await db
        .insert(schema.songs)
        .values({
          title,
          primaryArtist: cfg.primaryArtist,
          featuredArtists: cfg.featuredArtists,
          album: cfg.album,
          releaseDate: cfg.releaseDate,
          artUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
          previewUrl: t.preview,
          deezerTrackId: t.id,
          durationMs: t.duration ? t.duration * 1000 : null,
          eminemRole: "feature",
        })
        .returning({ id: schema.songs.id })
        .all();
      const newId = inserted_[0].id;
      console.log(`+ "${title}" — ${cfg.primaryArtist} (#${newId})`);
      // Add song_albums link
      if (t.album?.title) {
        await db
          .insert(schema.songAlbums)
          .values({
            songId: newId,
            albumName: cfg.album,
            albumArtUrl: t.album.cover_xl ?? t.album.cover_big ?? null,
            albumReleaseDate: cfg.releaseDate,
            isPrimary: false,
          })
          .onConflictDoNothing()
          .run();
      }
      inserted++;
    } catch (e) {
      console.error(`!! Failed Deezer track ${cfg.trackId}: ${e}`);
    }
  }

  // ── Manual diss tracks ────────────────────────────────────────────────
  for (const m of MANUAL_DISSES) {
    const k = `${normTitle(m.title)}|primary|${normTitle(m.primaryArtist)}`;
    if (byKey.has(k)) {
      console.log(`skip "${m.title}" — already in DB`);
      skipped++;
      continue;
    }
    const inserted_ = await db
      .insert(schema.songs)
      .values({
        title: m.title,
        primaryArtist: m.primaryArtist,
        featuredArtists: m.featuredArtists,
        album: m.album,
        releaseDate: m.releaseDate,
        artUrl: null,
        previewUrl: null,
        eminemRole: "primary",
      })
      .returning({ id: schema.songs.id })
      .all();
    const newId = inserted_[0].id;
    console.log(`+ "${m.title}" — ${m.primaryArtist} (#${newId}) [no preview]`);
    if (m.album) {
      await db
        .insert(schema.songAlbums)
        .values({
          songId: newId,
          albumName: m.album,
          albumArtUrl: null,
          albumReleaseDate: m.releaseDate,
          isPrimary: false,
        })
        .onConflictDoNothing()
        .run();
    }
    inserted++;
  }

  console.log(`\n→ Inserted ${inserted}, skipped ${skipped}.`);
  const final = await db.select({ id: schema.songs.id }).from(schema.songs).all();
  console.log(`Catalog now ${final.length} songs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
