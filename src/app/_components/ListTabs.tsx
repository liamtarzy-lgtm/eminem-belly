import Link from "next/link";

const TABS = [
  { view: "albums", label: "Albums", href: "/list" },
  { view: "songs", label: "Songs", href: "/list?view=songs" },
  { view: "tiers", label: "Tiers", href: "/list?view=tiers" },
  { view: "saved", label: "Saved", href: "/list?view=saved" },
] as const;

export function ListTabs({
  active,
}: {
  active: "albums" | "songs" | "tiers" | "saved";
}) {
  return (
    <div className="flex items-center gap-1 self-start rounded-full border border-(--border) bg-(--surface) p-1 text-sm">
      {TABS.map((tab) => {
        const isActive = tab.view === active;
        return (
          <Link
            key={tab.view}
            href={tab.href}
            className={
              isActive
                ? "rounded-full bg-(--accent) px-4 py-1.5 font-semibold text-white"
                : "rounded-full px-4 py-1.5 text-(--muted) hover:text-foreground"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
