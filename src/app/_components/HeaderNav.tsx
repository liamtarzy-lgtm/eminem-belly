"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "rank" },
  { href: "/list", label: "your list" },
  { href: "/games", label: "games" },
];

export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1 text-xs sm:text-sm">
      {ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-full bg-(--accent) px-3 py-1 font-semibold text-white sm:px-4"
                : "rounded-full px-3 py-1 text-(--muted) hover:text-foreground sm:px-4"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
