import Link from "next/link";
import { getCurrentUserId } from "@/lib/session";
import {
  getActiveSession,
  getAlbumRankings,
  getRanking,
  getSavedSongIds,
  getSavedSongs,
  getStats,
} from "@/lib/ranking/queries";
import { RankingList } from "../_components/RankingList";
import { SearchAddSong } from "../_components/SearchAddSong";
import { AlbumList } from "../_components/AlbumList";
import { ListTabs } from "../_components/ListTabs";
import { StatStrip } from "../_components/StatStrip";
import { SavedList } from "../_components/SavedList";
import { TierList } from "../_components/TierList";
import { ShareLinkButton } from "../_components/ShareLinkButton";

type View = "albums" | "songs" | "tiers" | "saved";

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: View =
    params.view === "songs"
      ? "songs"
      : params.view === "tiers"
        ? "tiers"
        : params.view === "saved"
          ? "saved"
          : "albums";

  const userId = await getCurrentUserId();
  const [ranking, albumRankings, activeSession, stats, savedIds, savedSongs] =
    await Promise.all([
      getRanking(userId),
      getAlbumRankings(userId),
      getActiveSession(userId),
      getStats(userId),
      getSavedSongIds(userId),
      getSavedSongs(userId),
    ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8 flex flex-col gap-6">
      <Link
        href="/"
        className="flex items-center justify-between rounded-lg bg-(--accent) px-4 py-3 text-sm font-semibold text-white hover:bg-(--accent-soft) transition"
      >
        <span>{activeSession ? "↺ resume comparison" : "rank more songs"}</span>
        <span>→</span>
      </Link>

      <StatStrip stats={stats} />

      <SearchAddSong />

      <div className="flex items-center justify-between gap-3">
        <ListTabs active={view} />
        {ranking.length >= 3 && <ShareLinkButton userId={userId} />}
      </div>

      {view === "albums" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              your favorite albums
            </h2>
            {albumRankings.length > 0 && (
              <span className="text-xs text-(--muted)">
                {albumRankings.length} album{albumRankings.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <AlbumList items={albumRankings} />
        </section>
      )}

      {view === "songs" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              your ranking
            </h2>
            {ranking.length > 0 && (
              <span className="text-xs text-(--muted)">
                {ranking.length} ranked
              </span>
            )}
          </div>
          <RankingList items={ranking} savedIds={savedIds} />
        </section>
      )}

      {view === "tiers" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              your tiers
            </h2>
          </div>
          <TierList items={ranking} />
        </section>
      )}

      {view === "saved" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              saved for later
            </h2>
            {savedSongs.length > 0 && (
              <span className="text-xs text-(--muted)">
                {savedSongs.length} saved
              </span>
            )}
          </div>
          <SavedList items={savedSongs} />
        </section>
      )}
    </div>
  );
}
