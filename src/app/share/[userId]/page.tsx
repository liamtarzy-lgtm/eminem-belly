import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getRanking, withDisplayRanks } from "@/lib/ranking/queries";
import { rankToScore, formatScore } from "@/lib/score";
import { SongImage } from "../../_components/SongImage";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  const who = user?.name ?? "Someone";
  return {
    title: `${who}'s Eminem top 10`,
    description: `${who} ranked Eminem's catalog. See their top 10.`,
    openGraph: {
      title: `${who}'s Eminem top 10`,
      description: `${who} ranked Eminem's catalog.`,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await db
    .select({ name: schema.users.name, image: schema.users.image })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) notFound();

  const ranking = await getRanking(userId);
  const total = ranking.length;
  const top10 = withDisplayRanks(ranking).slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
          Eminem · Belly
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {user.name ?? "Someone"}&apos;s top 10
        </h1>
        {total > 0 && (
          <div className="mt-1 text-sm text-(--muted)">
            ranked from {total} song{total === 1 ? "" : "s"}
          </div>
        )}
      </header>

      {top10.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-10 text-center text-(--muted)">
          {user.name ?? "This user"} hasn&apos;t ranked any songs yet.
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {top10.map(({ displayRank, song }, idx) => {
            const score = rankToScore(displayRank, total);
            const isTop = idx === 0;
            return (
              <li
                key={song.id}
                className={`flex items-center gap-3 rounded-xl border p-3 sm:gap-4 sm:p-4 ${
                  isTop
                    ? "border-(--accent) bg-gradient-to-r from-(--accent)/10 to-transparent"
                    : "border-(--border) bg-(--surface)"
                }`}
              >
                <div
                  className={`w-10 shrink-0 text-center font-mono text-2xl font-bold ${
                    isTop ? "text-(--accent-soft)" : "text-(--muted)"
                  }`}
                >
                  {displayRank}
                </div>
                <SongImage song={song} size={isTop ? "md" : "sm"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold sm:text-lg">
                    {song.title}
                  </div>
                  <div className="truncate text-sm text-(--muted)">
                    {song.primaryArtist}
                    {song.album && (
                      <span className="text-(--muted)/70"> · {song.album}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xl font-bold tabular-nums sm:text-2xl">
                  {formatScore(score)}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="mt-10 text-center text-xs text-(--muted)">
        Made with{" "}
        <a href="/" className="text-(--accent-soft) hover:underline">
          Eminem · Belly
        </a>{" "}
        — rank Em&apos;s catalog yourself.
      </footer>
    </div>
  );
}
