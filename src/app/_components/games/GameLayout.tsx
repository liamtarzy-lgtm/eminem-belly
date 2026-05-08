import Link from "next/link";

export function GameLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/games"
          className="text-xs text-(--muted) hover:text-foreground"
        >
          ← all games
        </Link>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}
