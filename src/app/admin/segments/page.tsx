import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getAdminSongList } from "@/lib/games/queries";
import { SongImage } from "@/app/_components/SongImage";

export const metadata = { title: "Segment Editor — Eminem Belly" };
export const dynamic = "force-dynamic";

export default async function SegmentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = sp.filter ?? "all"; // all | needs | has

  const all = await getAdminSongList();
  const filtered = all.filter((s) => {
    if (filter === "needs" && s.segmentCount > 0) return false;
    if (filter === "has" && s.segmentCount === 0) return false;
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.primaryArtist.toLowerCase().includes(q) ||
      (s.album?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalWithSegments = all.filter((s) => s.segmentCount > 0).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/games"
          className="text-xs text-(--muted) hover:text-foreground"
        >
          ← back to games
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Segment Editor
        </h1>
        <p className="text-sm text-(--muted)">
          Mark a 2-second window in each song&apos;s preview where Eminem is
          actually rapping. Validated segments are the only ones the &quot;Guess
          the Song&quot; game pulls from.
        </p>
      </header>

      <div className="flex flex-col gap-2 rounded-xl border border-(--border) bg-(--surface) p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="font-mono font-bold tabular-nums">
            {totalWithSegments}
          </span>{" "}
          of{" "}
          <span className="font-mono tabular-nums">{all.length}</span> songs
          have at least one validated segment.
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["all", "needs", "has"] as const).map((f) => (
            <Link
              key={f}
              href={{
                pathname: "/admin/segments",
                query: { ...(q ? { q } : {}), filter: f },
              }}
              className={
                filter === f
                  ? "rounded-full bg-(--accent) px-3 py-1 font-semibold text-white"
                  : "rounded-full border border-(--border) bg-(--surface-2) px-3 py-1 text-(--muted) hover:text-foreground"
              }
            >
              {f === "all" ? "all" : f === "needs" ? "needs segments" : "validated"}
            </Link>
          ))}
        </div>
      </div>

      <form className="flex gap-2" action="/admin/segments" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="search by title / artist / album"
          className="flex-1 rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-sm outline-none focus:border-(--accent)"
        />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <button
          type="submit"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-semibold text-white hover:bg-(--accent-soft)"
        >
          search
        </button>
      </form>

      <ol className="flex flex-col gap-1.5">
        {filtered.slice(0, 200).map((s) => (
          <li key={s.id}>
            <Link
              href={`/admin/segments/${s.id}`}
              className="flex items-center gap-3 rounded-lg border border-(--border) bg-(--surface) p-2.5 transition hover:border-(--accent) hover:bg-(--surface-2)"
            >
              <SongImage song={{ artUrl: s.artUrl, title: s.title }} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="truncate text-xs text-(--muted)">
                  {s.primaryArtist}
                  {s.album && <span> · {s.album}</span>}
                </div>
              </div>
              <div
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  s.segmentCount > 0
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-zinc-500/10 text-(--muted)"
                }`}
              >
                {s.segmentCount} {s.segmentCount === 1 ? "seg" : "segs"}
              </div>
            </Link>
          </li>
        ))}
      </ol>
      {filtered.length > 200 && (
        <div className="text-center text-xs text-(--muted)">
          {filtered.length - 200} more match — refine your search.
        </div>
      )}
    </div>
  );
}
