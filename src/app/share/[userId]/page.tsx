import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getRanking, withDisplayRanks } from "@/lib/ranking/queries";
import { rankToScore, formatScore, scoreClasses } from "@/lib/score";
import { SongImage } from "../../_components/SongImage";

export const dynamic = "force-dynamic";

type View = "top10" | "full" | "tiers";

const TIERS = [
  { letter: "S", minPct: 0.0, maxPct: 0.1, label: "Untouchable", color: "#facc15" },
  { letter: "A", minPct: 0.1, maxPct: 0.25, label: "Heat", color: "#fb923c" },
  { letter: "B", minPct: 0.25, maxPct: 0.5, label: "Solid", color: "#dc2626" },
  { letter: "C", minPct: 0.5, maxPct: 0.75, label: "OK", color: "#a3a3a3" },
  { letter: "D", minPct: 0.75, maxPct: 0.9, label: "Skip", color: "#525252" },
  { letter: "F", minPct: 0.9, maxPct: 1.01, label: "Mid", color: "#404040" },
];

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
  const ogImage = `/api/og/${userId}`;
  return {
    title: `${who}'s Eminem top 10`,
    description: `${who} ranked Eminem's catalog.`,
    openGraph: {
      title: `${who}'s Eminem top 10`,
      description: `${who} ranked Eminem's catalog.`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${who}'s Eminem top 10`,
      description: `${who} ranked Eminem's catalog.`,
      images: [ogImage],
    },
  };
}

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { userId } = await params;
  const sp = await searchParams;
  const view: View =
    sp.view === "full" ? "full" : sp.view === "tiers" ? "tiers" : "top10";

  const user = await db
    .select({ name: schema.users.name, image: schema.users.image })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) notFound();

  const ranking = await getRanking(userId);
  const total = ranking.length;
  const ranked = withDisplayRanks(ranking);

  const slug = (user.name ?? "eminem").toLowerCase().replace(/\s+/g, "-");
  const downloadUrl =
    view === "top10"
      ? `/api/og/${userId}`
      : `/api/og/${userId}?view=${view}`;
  const downloadName =
    view === "top10"
      ? `${slug}-top-10.png`
      : view === "full"
        ? `${slug}-full-ranking.png`
        : `${slug}-tiers.png`;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
          Eminem · Belly
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {user.name ?? "Someone"}&apos;s ranking
        </h1>
        {total > 0 && (
          <div className="mt-1 text-sm text-(--muted)">
            from {total} song{total === 1 ? "" : "s"} ranked
          </div>
        )}
      </header>

      <ShareTabs userId={userId} active={view} />

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--border) bg-(--surface) p-10 text-center text-(--muted)">
          {user.name ?? "This user"} hasn&apos;t ranked any songs yet.
        </div>
      ) : view === "top10" ? (
        <Top10View ranked={ranked} total={total} />
      ) : view === "full" ? (
        <FullView ranked={ranked} total={total} />
      ) : (
        <TiersView ranked={ranked} total={total} />
      )}

      {ranked.length > 0 && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href={downloadUrl}
            download={downloadName}
            className="rounded-lg bg-(--accent) px-5 py-2.5 text-sm font-semibold text-white hover:bg-(--accent-soft)"
          >
            ↓ download {view === "top10" ? "top 10" : view === "full" ? "full list" : "tier list"} as image
          </a>
          <div className="text-[11px] text-center text-(--muted)">
            Or paste this page&apos;s link into iMessage / Twitter / etc. — the preview renders automatically.
          </div>
        </div>
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

function ShareTabs({ userId, active }: { userId: string; active: View }) {
  const tabs: { view: View; label: string }[] = [
    { view: "top10", label: "Top 10" },
    { view: "full", label: "Full" },
    { view: "tiers", label: "Tiers" },
  ];
  return (
    <div className="mb-5 flex justify-center">
      <div className="flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1 text-sm">
        {tabs.map((t) => {
          const href =
            t.view === "top10"
              ? `/share/${userId}`
              : `/share/${userId}?view=${t.view}`;
          const isActive = t.view === active;
          return (
            <Link
              key={t.view}
              href={href}
              className={
                isActive
                  ? "rounded-full bg-(--accent) px-4 py-1.5 font-semibold text-white"
                  : "rounded-full px-4 py-1.5 text-(--muted) hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Top10View({
  ranked,
  total,
}: {
  ranked: ReturnType<typeof withDisplayRanks>;
  total: number;
}) {
  const top10 = ranked.slice(0, 10);
  return (
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
              <div className="truncate font-semibold sm:text-lg">{song.title}</div>
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
  );
}

function FullView({
  ranked,
  total,
}: {
  ranked: ReturnType<typeof withDisplayRanks>;
  total: number;
}) {
  return (
    <ol className="flex flex-col gap-1">
      {ranked.map(({ displayRank, song }) => {
        const score = rankToScore(displayRank, total);
        const c = scoreClasses(score);
        return (
          <li
            key={song.id}
            className="flex items-center gap-3 rounded-lg border border-(--border) bg-(--surface) p-2"
          >
            <div className="w-8 shrink-0 text-right font-mono text-sm text-(--muted)">
              {displayRank}
            </div>
            <SongImage song={song} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{song.title}</div>
              <div className="truncate text-xs text-(--muted)">
                {song.primaryArtist}
              </div>
            </div>
            <div
              className={`shrink-0 font-mono text-base font-bold tabular-nums ${c.text}`}
            >
              {formatScore(score)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TiersView({
  ranked,
  total,
}: {
  ranked: ReturnType<typeof withDisplayRanks>;
  total: number;
}) {
  const buckets: ReturnType<typeof withDisplayRanks>[] = TIERS.map(() => []);
  for (const r of ranked) {
    const pct = (r.displayRank - 1) / Math.max(total, 1);
    for (let i = 0; i < TIERS.length; i++) {
      const t = TIERS[i];
      if (pct >= t.minPct && pct < t.maxPct) {
        buckets[i].push(r);
        break;
      }
    }
  }
  const visible = TIERS.map((t, i) => ({ tier: t, songs: buckets[i] }));
  return (
    <div className="flex flex-col gap-2">
      {visible.map(({ tier, songs }) => (
        <div
          key={tier.letter}
          className="flex overflow-hidden rounded-xl border border-(--border) bg-(--surface)"
        >
          <div
            className="flex min-w-[64px] flex-col items-center justify-center px-2 py-3 sm:min-w-[88px]"
            style={{ backgroundColor: tier.color, color: "#0a0a0a" }}
          >
            <div className="text-3xl font-black leading-none sm:text-4xl">
              {tier.letter}
            </div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">
              {tier.label}
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-start gap-2 p-2 sm:gap-3 sm:p-3">
            {songs.length === 0 ? (
              <div className="self-center px-2 text-xs italic text-(--muted)">
                no songs in this tier
              </div>
            ) : (
              songs.map((r) => (
                <div
                  key={r.song.id}
                  className="flex w-[64px] flex-col items-center sm:w-[80px]"
                  title={`${r.song.title} — ${r.song.primaryArtist}`}
                >
                  <SongImage song={r.song} size="sm" />
                  <div className="mt-1 line-clamp-2 text-center text-[10px] leading-tight text-(--muted)">
                    {r.song.title}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
