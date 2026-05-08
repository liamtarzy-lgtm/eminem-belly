"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";

export type Segment = { start: number; end: number; confidence?: string };

export async function addSegment(songId: number, start: number, end: number) {
  await requireAdmin();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, error: "Invalid range" };
  }
  // Cap a segment at 2.5s so we don't accidentally save a hook or longer
  // section. Most snippets target 2.0s exactly.
  if (end - start > 3) end = start + 2;
  const song = await db
    .select({ segments: schema.songs.validatedRapSegments })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId))
    .get();
  if (!song) return { ok: false, error: "Song not found" };
  const updated = [
    ...song.segments,
    {
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      confidence: "validated",
    } satisfies Segment,
  ];
  await db
    .update(schema.songs)
    .set({ validatedRapSegments: updated })
    .where(eq(schema.songs.id, songId))
    .run();
  revalidatePath("/admin/segments");
  revalidatePath(`/admin/segments/${songId}`);
  return { ok: true };
}

export async function deleteSegment(songId: number, index: number) {
  await requireAdmin();
  const song = await db
    .select({ segments: schema.songs.validatedRapSegments })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId))
    .get();
  if (!song) return { ok: false, error: "Song not found" };
  const updated = song.segments.filter((_, i) => i !== index);
  await db
    .update(schema.songs)
    .set({ validatedRapSegments: updated })
    .where(eq(schema.songs.id, songId))
    .run();
  revalidatePath("/admin/segments");
  revalidatePath(`/admin/segments/${songId}`);
  return { ok: true };
}
