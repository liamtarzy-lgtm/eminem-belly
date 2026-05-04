"use client";

import { useState } from "react";

export function ShareLinkButton({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = `${window.location.origin}/share/${userId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "My Eminem ranking",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled share or clipboard blocked
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-(--muted) hover:border-(--accent-soft) hover:text-foreground sm:text-sm"
    >
      {copied ? "✓ link copied" : "↗ share top 10"}
    </button>
  );
}
