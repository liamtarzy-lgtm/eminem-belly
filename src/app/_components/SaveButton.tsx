"use client";

import { useState, useTransition } from "react";
import { toggleSaved } from "@/lib/ranking/actions";

type Props = {
  songId: number;
  initialSaved?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function SaveButton({ songId, initialSaved = false, size = "md", className = "" }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [, startTransition] = useTransition();
  const dim = size === "sm" ? "h-7 w-7 text-sm" : "h-10 w-10 text-lg sm:h-12 sm:w-12 sm:text-xl";

  const onToggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaved(songId);
      setSaved(result.saved);
    });
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Saved (tap to remove)" : "Save for later"}
      className={`${className} ${dim} flex items-center justify-center rounded-full border ${
        saved
          ? "border-(--accent) bg-(--accent) text-white"
          : "border-white/30 bg-black/65 text-white hover:bg-black/85"
      } shadow-lg backdrop-blur transition hover:scale-110 active:scale-95`}
    >
      <span aria-hidden>{saved ? "✓" : "+"}</span>
    </button>
  );
}
