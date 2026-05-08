import Link from "next/link";

export const metadata = { title: "Games — Eminem Belly" };

const GAMES = [
  {
    href: "/games/guess-the-song",
    title: "Guess the Song in 2 Seconds",
    description:
      "A 2-second clip of Eminem rapping. Pick the song from four similar choices. Streak bonuses, optional replay, 7-second answer timer.",
    icon: "♫",
    accent: "from-(--accent)/30 via-(--accent)/10 to-transparent",
  },
  {
    href: "/games/finish-the-bar",
    title: "Finish the Bar",
    description:
      "We show you the first half of a bar — type what comes next. Forgiving matching, optional hints (with score penalty).",
    icon: "✎",
    accent: "from-amber-500/30 via-amber-500/10 to-transparent",
  },
];

export default function GamesPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
          games
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Eminem · Belly Arcade
        </h1>
        <p className="text-sm text-(--muted)">
          Pick a game. High scores save locally per device.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="group relative overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-5 transition hover:border-(--accent) hover:bg-(--surface-2) sm:p-6"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${g.accent} opacity-50 transition group-hover:opacity-100`}
            />
            <div className="relative flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-(--surface-2) text-2xl"
                aria-hidden
              >
                {g.icon}
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold tracking-tight sm:text-xl">
                  {g.title}
                </div>
                <div className="mt-1 text-sm text-(--muted)">
                  {g.description}
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-(--accent-soft)">
                  Play →
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-(--border) bg-(--surface) p-4 text-xs text-(--muted)">
        <div className="font-semibold uppercase tracking-wider text-foreground">
          adding your own content
        </div>
        <p className="mt-1 leading-relaxed">
          Both games ship with placeholder data. Drop audio clips in{" "}
          <code className="rounded bg-(--surface-2) px-1">public/audio/eminem/</code>{" "}
          and edit{" "}
          <code className="rounded bg-(--surface-2) px-1">
            src/lib/games/snippets.ts
          </code>{" "}
          and{" "}
          <code className="rounded bg-(--surface-2) px-1">
            src/lib/games/lyrics.ts
          </code>{" "}
          to add your own questions. Only use audio + lyric content you have
          the right to host — don&apos;t scrape from streaming services.
        </p>
      </div>
    </div>
  );
}
