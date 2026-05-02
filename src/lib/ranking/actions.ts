"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUserId } from "@/lib/session";
import {
  getActiveSession,
  getRankingCount,
  getRankingForSong,
  getRecommendation,
  getSongAtPosition,
  getSongById,
  getSongInRangeExcluding,
  searchCatalog,
} from "./queries";

const { rankings, comparisons, insertionSessions } = schema;

function safeRevalidate(...paths: string[]) {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // ignore — outside Next.js runtime (scripts)
    }
  }
}

export type Song = typeof schema.songs.$inferSelect;

export type Step =
  | { kind: "done"; finalPosition: number; targetSongId: number }
  | {
      kind: "compare";
      sessionId: number;
      target: Song;
      opponent: Song;
      progress: { current: number; max: number };
    };

function calcMaxQuestions(rangeSize: number): number {
  if (rangeSize <= 1) return 1;
  return Math.ceil(Math.log2(rangeSize));
}

type TxLike = {
  run: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

async function shiftPositionsUpFrom(
  txDb: TxLike,
  userId: string,
  fromPosition: number,
) {
  // Two-step shift to dodge the (user_id, position) unique constraint:
  // negate-then-restore lets us increment without per-row collisions.
  await txDb.run(
    sql`UPDATE rankings SET position = -(position + 1) WHERE user_id = ${userId} AND position >= ${fromPosition}`,
  );
  await txDb.run(
    sql`UPDATE rankings SET position = -position WHERE user_id = ${userId} AND position < 0`,
  );
}

async function shiftPositionsDownFrom(
  txDb: TxLike,
  userId: string,
  fromPosition: number,
) {
  await txDb.run(
    sql`UPDATE rankings SET position = -(position - 1) WHERE user_id = ${userId} AND position > ${fromPosition}`,
  );
  await txDb.run(
    sql`UPDATE rankings SET position = -position WHERE user_id = ${userId} AND position < 0`,
  );
}

async function abandonActiveSessions(userId: string) {
  await db
    .update(insertionSessions)
    .set({ status: "abandoned", completedAt: new Date() })
    .where(
      and(
        eq(insertionSessions.userId, userId),
        eq(insertionSessions.status, "active"),
      ),
    )
    .run();
}

async function placeAndComplete(
  userId: string,
  sessionId: number,
  targetSongId: number,
  finalPosition: number,
  sessionPatch: Partial<typeof insertionSessions.$inferInsert>,
) {
  await db.transaction(async (tx) => {
    await shiftPositionsUpFrom(tx, userId, finalPosition);
    await tx
      .insert(rankings)
      .values({
        userId,
        songId: targetSongId,
        position: finalPosition,
        updatedAt: new Date(),
      })
      .run();
    await tx
      .update(insertionSessions)
      .set({
        ...sessionPatch,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(insertionSessions.id, sessionId))
      .run();
  });
  safeRevalidate("/", "/list");
}

// ── Public API ──────────────────────────────────────────────────────────

export async function startInsertion(songId: number): Promise<Step> {
  const userId = await getCurrentUserId();

  const existing = await getRankingForSong(userId, songId);
  if (existing) {
    return {
      kind: "done",
      finalPosition: existing.position,
      targetSongId: songId,
    };
  }

  await abandonActiveSessions(userId);

  const target = await getSongById(songId);
  if (!target) throw new Error(`Song ${songId} not found`);

  const N = await getRankingCount(userId);

  if (N === 0) {
    await db
      .insert(rankings)
      .values({ userId, songId, position: 1, updatedAt: new Date() })
      .run();
    safeRevalidate("/", "/list");
    return { kind: "done", finalPosition: 1, targetSongId: songId };
  }

  const low = 1;
  const high = N + 1;
  const maxQuestions = calcMaxQuestions(high - low + 1);
  const midPosition = Math.floor((low + high) / 2);
  const opponent = await getSongAtPosition(userId, midPosition);
  if (!opponent) throw new Error(`No song at position ${midPosition}`);

  const inserted = await db
    .insert(insertionSessions)
    .values({
      userId,
      targetSongId: songId,
      low,
      high,
      skippedOpponentIds: [],
      status: "active",
      isRecompare: false,
      questionsAsked: 0,
      maxQuestions,
    })
    .returning()
    .all();
  const session = inserted[0];

  return {
    kind: "compare",
    sessionId: session.id,
    target,
    opponent: opponent.song,
    progress: { current: 1, max: maxQuestions },
  };
}

export async function submitChoice(
  sessionId: number,
  opponentSongId: number,
  targetWon: boolean,
): Promise<Step> {
  const userId = await getCurrentUserId();

  const session = await db
    .select()
    .from(insertionSessions)
    .where(eq(insertionSessions.id, sessionId))
    .get();
  if (!session || session.userId !== userId || session.status !== "active") {
    throw new Error(`Invalid session ${sessionId}`);
  }

  const target = await getSongById(session.targetSongId);
  if (!target) throw new Error("Target song missing");

  const opponentRow = await db
    .select({ position: rankings.position })
    .from(rankings)
    .where(
      and(eq(rankings.userId, userId), eq(rankings.songId, opponentSongId)),
    )
    .get();
  if (!opponentRow) throw new Error("Opponent not in ranking");
  const opponentPosition = opponentRow.position;

  let newLow = session.low;
  let newHigh = session.high;
  if (targetWon) {
    newHigh = opponentPosition;
  } else {
    newLow = opponentPosition + 1;
  }

  await db
    .insert(comparisons)
    .values({
      userId,
      winnerSongId: targetWon ? session.targetSongId : opponentSongId,
      loserSongId: targetWon ? opponentSongId : session.targetSongId,
      sessionId,
    })
    .run();

  const newQuestionsAsked = session.questionsAsked + 1;
  const sessionPatch = {
    low: newLow,
    high: newHigh,
    questionsAsked: newQuestionsAsked,
  };

  if (newLow >= newHigh) {
    await placeAndComplete(
      userId,
      sessionId,
      session.targetSongId,
      newLow,
      sessionPatch,
    );
    return {
      kind: "done",
      finalPosition: newLow,
      targetSongId: session.targetSongId,
    };
  }

  const next = await getSongInRangeExcluding(userId, newLow, newHigh, [
    ...session.skippedOpponentIds,
    opponentSongId,
    session.targetSongId,
  ]);
  if (!next) {
    await placeAndComplete(
      userId,
      sessionId,
      session.targetSongId,
      newLow,
      sessionPatch,
    );
    return {
      kind: "done",
      finalPosition: newLow,
      targetSongId: session.targetSongId,
    };
  }

  await db
    .update(insertionSessions)
    .set(sessionPatch)
    .where(eq(insertionSessions.id, sessionId))
    .run();

  return {
    kind: "compare",
    sessionId,
    target,
    opponent: next.song,
    progress: {
      current: Math.min(newQuestionsAsked + 1, session.maxQuestions),
      max: session.maxQuestions,
    },
  };
}

export async function skipOpponent(
  sessionId: number,
  opponentSongId: number,
): Promise<Step> {
  const userId = await getCurrentUserId();

  const session = await db
    .select()
    .from(insertionSessions)
    .where(eq(insertionSessions.id, sessionId))
    .get();
  if (!session || session.userId !== userId || session.status !== "active") {
    throw new Error(`Invalid session ${sessionId}`);
  }

  const target = await getSongById(session.targetSongId);
  if (!target) throw new Error("Target song missing");

  const newSkipped = [...session.skippedOpponentIds, opponentSongId];

  const next = await getSongInRangeExcluding(
    userId,
    session.low,
    session.high,
    [...newSkipped, session.targetSongId],
  );
  if (!next) {
    await placeAndComplete(
      userId,
      sessionId,
      session.targetSongId,
      session.low,
      { skippedOpponentIds: newSkipped },
    );
    return {
      kind: "done",
      finalPosition: session.low,
      targetSongId: session.targetSongId,
    };
  }

  await db
    .update(insertionSessions)
    .set({ skippedOpponentIds: newSkipped })
    .where(eq(insertionSessions.id, sessionId))
    .run();

  return {
    kind: "compare",
    sessionId,
    target,
    opponent: next.song,
    progress: {
      current: session.questionsAsked + 1,
      max: session.maxQuestions,
    },
  };
}

export async function tooToughChoice(
  sessionId: number,
  opponentSongId: number,
): Promise<Step> {
  const userId = await getCurrentUserId();
  const session = await db
    .select()
    .from(insertionSessions)
    .where(eq(insertionSessions.id, sessionId))
    .get();
  if (!session || session.userId !== userId || session.status !== "active") {
    throw new Error(`Invalid session ${sessionId}`);
  }
  const opponentRow = await db
    .select({ position: rankings.position })
    .from(rankings)
    .where(
      and(eq(rankings.userId, userId), eq(rankings.songId, opponentSongId)),
    )
    .get();
  if (!opponentRow) throw new Error("Opponent not in ranking");

  const finalPosition = opponentRow.position;
  await db
    .insert(comparisons)
    .values({
      userId,
      winnerSongId: session.targetSongId,
      loserSongId: opponentSongId,
      sessionId,
    })
    .run();

  await placeAndComplete(
    userId,
    sessionId,
    session.targetSongId,
    finalPosition,
    {
      questionsAsked: session.questionsAsked + 1,
    },
  );

  return {
    kind: "done",
    finalPosition,
    targetSongId: session.targetSongId,
  };
}

export async function cancelSession(sessionId: number): Promise<void> {
  const userId = await getCurrentUserId();
  await db
    .update(insertionSessions)
    .set({ status: "abandoned", completedAt: new Date() })
    .where(
      and(
        eq(insertionSessions.id, sessionId),
        eq(insertionSessions.userId, userId),
      ),
    )
    .run();
  safeRevalidate("/", "/list");
}

export async function removeSongFromRanking(songId: number): Promise<void> {
  const userId = await getCurrentUserId();
  const existing = await getRankingForSong(userId, songId);
  if (!existing) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(rankings)
      .where(and(eq(rankings.userId, userId), eq(rankings.songId, songId)))
      .run();
    await shiftPositionsDownFrom(tx, userId, existing.position);
  });
  safeRevalidate("/", "/list");
}

export async function startRecompare(songId: number): Promise<Step> {
  await removeSongFromRanking(songId);
  return startInsertion(songId);
}

export async function undoLastAction(): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();

  const lastComparison = await db
    .select()
    .from(comparisons)
    .where(eq(comparisons.userId, userId))
    .orderBy(desc(comparisons.id))
    .limit(1)
    .get();

  if (!lastComparison?.sessionId) return { ok: false };

  const session = await db
    .select()
    .from(insertionSessions)
    .where(eq(insertionSessions.id, lastComparison.sessionId))
    .get();
  if (!session) return { ok: false };

  await db.transaction(async (tx) => {
    if (session.status === "completed") {
      const placed = await tx
        .select({ position: rankings.position })
        .from(rankings)
        .where(
          and(
            eq(rankings.userId, userId),
            eq(rankings.songId, session.targetSongId),
          ),
        )
        .get();
      if (placed) {
        await tx
          .delete(rankings)
          .where(
            and(
              eq(rankings.userId, userId),
              eq(rankings.songId, session.targetSongId),
            ),
          )
          .run();
        await shiftPositionsDownFrom(tx, userId, placed.position);
      }
      await tx
        .update(insertionSessions)
        .set({ status: "active", completedAt: null })
        .where(eq(insertionSessions.id, session.id))
        .run();
    }

    await tx
      .update(insertionSessions)
      .set({ status: "abandoned", completedAt: new Date() })
      .where(
        and(
          eq(insertionSessions.userId, userId),
          eq(insertionSessions.status, "active"),
          sql`${insertionSessions.id} > ${session.id}`,
        ),
      )
      .run();

    await tx
      .delete(comparisons)
      .where(eq(comparisons.id, lastComparison.id))
      .run();

    const remaining = await tx
      .select()
      .from(comparisons)
      .where(eq(comparisons.sessionId, session.id))
      .orderBy(asc(comparisons.id))
      .all();

    const nRow = await tx
      .select({ n: sql<number>`count(*)` })
      .from(rankings)
      .where(eq(rankings.userId, userId))
      .get();
    const N = nRow?.n ?? 0;

    let low = 1;
    let high = N + 1;
    for (const c of remaining) {
      const opponentId =
        c.winnerSongId === session.targetSongId
          ? c.loserSongId
          : c.winnerSongId;
      const targetWon = c.winnerSongId === session.targetSongId;
      const opponentRow = await tx
        .select({ position: rankings.position })
        .from(rankings)
        .where(
          and(eq(rankings.userId, userId), eq(rankings.songId, opponentId)),
        )
        .get();
      if (!opponentRow) continue;
      if (targetWon) high = opponentRow.position;
      else low = opponentRow.position + 1;
    }

    await tx
      .update(insertionSessions)
      .set({ low, high, questionsAsked: remaining.length })
      .where(eq(insertionSessions.id, session.id))
      .run();
  });

  safeRevalidate("/", "/list");
  return { ok: true };
}

export async function undoLastForm(_formData: FormData): Promise<void> {
  await undoLastAction();
  safeRevalidate("/", "/list");
}

export async function hasUndoTarget(): Promise<boolean> {
  const userId = await getCurrentUserId();
  const last = await db
    .select({ id: comparisons.id })
    .from(comparisons)
    .where(eq(comparisons.userId, userId))
    .orderBy(desc(comparisons.id))
    .limit(1)
    .get();
  return !!last;
}

export async function searchSongs(query: string): Promise<Song[]> {
  return searchCatalog(query, 20);
}

export async function getNextRecommendation(
  excludeIds: number[] = [],
): Promise<Song | null> {
  const userId = await getCurrentUserId();
  return (await getRecommendation(userId, excludeIds)) ?? null;
}

type CompareStep = Extract<Step, { kind: "compare" }>;

export async function getOrStartNextStep(): Promise<CompareStep | null> {
  const userId = await getCurrentUserId();

  const active = await getActiveStep();
  if (active && active.kind === "compare") return active;

  for (let attempts = 0; attempts < 5; attempts++) {
    const rec = await getRecommendation(userId);
    if (!rec) return null;
    const result = await startInsertion(rec.id);
    if (result.kind === "compare") return result;
  }
  return null;
}

export async function abandonAndNext(formData: FormData): Promise<void> {
  const sessionId = Number(formData.get("sessionId"));
  if (sessionId) await cancelSession(sessionId);
  safeRevalidate("/");
}

export async function tooToughForm(formData: FormData): Promise<void> {
  const sessionId = Number(formData.get("sessionId"));
  const opponentSongId = Number(formData.get("opponentSongId"));
  await tooToughChoice(sessionId, opponentSongId);
  safeRevalidate("/", "/list");
}

export async function submitChoiceForm(formData: FormData): Promise<void> {
  const sessionId = Number(formData.get("sessionId"));
  const opponentSongId = Number(formData.get("opponentSongId"));
  const targetWon = formData.get("targetWon") === "true";
  await submitChoice(sessionId, opponentSongId, targetWon);
  safeRevalidate("/", "/list");
}

export async function skipOpponentForm(formData: FormData): Promise<void> {
  const sessionId = Number(formData.get("sessionId"));
  const opponentSongId = Number(formData.get("opponentSongId"));
  await skipOpponent(sessionId, opponentSongId);
  safeRevalidate("/", "/list");
}

export async function cancelSessionForm(formData: FormData): Promise<void> {
  const sessionId = Number(formData.get("sessionId"));
  await cancelSession(sessionId);
  redirect("/list");
}

export async function recompareForm(formData: FormData): Promise<void> {
  const songId = Number(formData.get("songId"));
  await startRecompare(songId);
  redirect("/");
}

export async function removeFromRankingForm(formData: FormData): Promise<void> {
  const songId = Number(formData.get("songId"));
  await removeSongFromRanking(songId);
  safeRevalidate("/", "/list");
}

export async function getActiveStep(): Promise<Step | null> {
  const userId = await getCurrentUserId();
  const session = await getActiveSession(userId);
  if (!session) return null;

  const target = await getSongById(session.targetSongId);
  if (!target) return null;

  const next = await getSongInRangeExcluding(
    userId,
    session.low,
    session.high,
    [...session.skippedOpponentIds, session.targetSongId],
  );
  if (!next) return null;

  return {
    kind: "compare",
    sessionId: session.id,
    target,
    opponent: next.song,
    progress: {
      current: session.questionsAsked + 1,
      max: session.maxQuestions,
    },
  };
}
