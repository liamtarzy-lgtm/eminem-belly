import Link from "next/link";
import {
  getOrStartNextStep,
  submitChoiceForm,
  skipOpponentForm,
  abandonAndNext,
  tooToughForm,
  undoLastForm,
  hasUndoTarget,
} from "@/lib/ranking/actions";
import { getCurrentUserId } from "@/lib/session";
import { getSavedSongIds } from "@/lib/ranking/queries";
import { SongImage } from "./_components/SongImage";
import { PlayPreview } from "./_components/PlayPreview";
import { SaveButton } from "./_components/SaveButton";
import { SearchAddSong } from "./_components/SearchAddSong";

export default async function HomePage() {
  const step = await getOrStartNextStep();
  const userId = await getCurrentUserId();
  const [canUndo, savedIds] = await Promise.all([
    hasUndoTarget(),
    getSavedSongIds(userId),
  ]);

  if (!step) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="text-3xl font-bold tracking-tight">
          You&apos;ve ranked everything.
        </h1>
        <p className="text-(--muted)">
          Em legend status confirmed. Check your final list.
        </p>
        <Link
          href="/list"
          className="rounded-lg bg-(--accent) px-5 py-2.5 font-semibold text-white hover:bg-(--accent-soft)"
        >
          See your list →
        </Link>
      </div>
    );
  }

  const { sessionId, target, opponent, progress } = step;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-3 pt-2 sm:px-6 sm:pt-6 sm:pb-6">
      <div className="mb-3 sm:mb-4">
        <SearchAddSong />
      </div>
      <div className="mb-2 flex items-center justify-between gap-3 px-1 sm:mb-4">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
            placing
          </div>
          <div className="truncate text-sm font-semibold">{target.title}</div>
        </div>
        <div className="flex items-center gap-3">
          {canUndo && (
            <form action={undoLastForm}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-xs font-medium text-(--muted) hover:border-(--accent-soft) hover:text-foreground"
              >
                ← back
              </button>
            </form>
          )}
          <ProgressBar current={progress.current} max={progress.max} />
        </div>
      </div>

      <h1 className="px-1 pb-2 text-center text-xl font-bold tracking-tight sm:pb-4 sm:text-4xl">
        Which one&apos;s better?
      </h1>

      <div className="relative grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
        <ChoiceCard
          sessionId={sessionId}
          opponentSongId={opponent.id}
          isTarget
          song={target}
          isSaved={savedIds.has(target.id)}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-(--border) bg-(--background) text-[11px] font-bold uppercase tracking-wider text-(--accent-soft) shadow-lg sm:h-12 sm:w-12 sm:text-xs">
            vs
          </div>
        </div>
        <ChoiceCard
          sessionId={sessionId}
          opponentSongId={opponent.id}
          isTarget={false}
          song={opponent}
          isSaved={savedIds.has(opponent.id)}
        />
      </div>

      <div className="mt-3 flex items-center justify-center text-sm sm:mt-5">
        <form action={tooToughForm}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="opponentSongId" value={opponent.id} />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-full border border-(--accent)/50 bg-(--accent)/10 px-4 py-1.5 text-xs font-medium text-(--accent-soft) transition hover:border-(--accent) hover:bg-(--accent)/20 active:scale-95 sm:px-5 sm:py-2 sm:text-sm"
          >
            ⚖ too tough — call it a tie
          </button>
        </form>
      </div>
    </div>
  );
}

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(
    0,
    Math.min(100, ((current - 1) / Math.max(max, 1)) * 100),
  );
  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-medium tabular-nums text-(--muted)">
        comparison {current} of ~{max}
      </div>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-(--surface-2) sm:w-24">
        <div
          className="h-full bg-(--accent) transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type SongLike = {
  id: number;
  title: string;
  primaryArtist: string;
  album: string | null;
  artUrl: string | null;
  previewUrl: string | null;
};

function ChoiceCard({
  sessionId,
  opponentSongId,
  isTarget,
  song,
  isSaved,
}: {
  sessionId: number;
  opponentSongId: number;
  isTarget: boolean;
  song: SongLike;
  isSaved: boolean;
}) {
  // Refreshing target = abandon current insertion + start a new one with a
  // different song. Refreshing opponent = pick a different opponent in the
  // same binary-search range (the existing skip behavior).
  const refreshAction = isTarget ? abandonAndNext : skipOpponentForm;

  return (
    <div className="relative flex">
      {/* Top-left: refresh icon — swap THIS card */}
      <form action={refreshAction} className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        {!isTarget && (
          <input type="hidden" name="opponentSongId" value={opponentSongId} />
        )}
        <button
          type="submit"
          aria-label="Different song"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/85 active:scale-95"
        >
          ↻
        </button>
      </form>

      {/* Top-right corner cluster: play + save. Keys must be unique among
          siblings — sharing key={song.id} between two different components
          confuses React reconciliation and leaves stale DOM behind. */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 sm:right-4 sm:top-4">
        <PlayPreview
          key={`play-${song.id}`}
          songId={song.id}
          hasPreview={!!song.previewUrl}
          title={song.title}
          artist={song.primaryArtist}
        />
        <SaveButton
          key={`save-${song.id}`}
          songId={song.id}
          initialSaved={isSaved}
          size="sm"
        />
      </div>

      <form action={submitChoiceForm} className="flex w-full">
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="opponentSongId" value={opponentSongId} />
        <input
          type="hidden"
          name="targetWon"
          value={isTarget ? "true" : "false"}
        />
        <button
          type="submit"
          className="group relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-3 text-center transition active:scale-[0.985] hover:border-(--accent) hover:bg-(--surface-2) hover:shadow-2xl hover:shadow-(--accent)/15 sm:gap-5 sm:p-8 sm:min-h-[55vh]"
        >
          <div className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-(--accent) transition-transform duration-300 group-hover:scale-x-100" />
          <SongImage song={song} size="lg" />
          <div className="flex w-full flex-col items-center gap-0.5 px-1 sm:gap-1">
            <div className="line-clamp-2 text-base font-bold leading-tight sm:text-2xl">
              {song.title}
            </div>
            <div className="line-clamp-1 text-sm text-(--muted)">
              {song.primaryArtist}
            </div>
            {song.album && (
              <div className="mt-0.5 line-clamp-1 text-[11px] text-(--muted)/80">
                {song.album}
              </div>
            )}
          </div>
        </button>
      </form>
    </div>
  );
}
