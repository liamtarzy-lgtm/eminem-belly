import Link from "next/link";
import { getCurrentUserId } from "@/lib/session";
import {
  getActiveSession,
  getAlbumRankings,
  getRanking,
  getStats,
} from "@/lib/ranking/queries";
import { RankingList } from "../_components/RankingList";
import { SearchAddSong } from "../_components/SearchAddSong";
import { TopThreePodium } from "../_components/TopThreePodium";
import { AlbumList } from "../_components/AlbumList";
import { ListTabs } from "../_components/ListTabs";
import { StatStrip } from "../_components/StatStrip";

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: "albums" | "songs" = params.view === "songs" ? "songs" : "albums";

  const userId = await getCurrentUserId();
  const [ranking, albumRankings, activeSession, stats] = await Promise.all([
    getRanking(userId),
    getAlbumRankings(userId),
    getActiveSession(userId),
    getStats(userId),
  ]);
  const hasPodium = ranking.length >= 3;

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

      {hasPodium && view === "songs" && <TopThreePodium items={ranking} />}

      <ListTabs active={view} />

      {view === "albums" ? (
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
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              {hasPodium ? "the rest" : "your songs"}
            </h2>
            {ranking.length > 0 && (
              <span className="text-xs text-(--muted)">
                {ranking.length} ranked
              </span>
            )}
          </div>
          <SearchAddSong />
          <RankingList items={ranking} startAtPosition={hasPodium ? 4 : 1} />
        </section>
      )}
    </div>
  );
}
