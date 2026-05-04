"use client";

import { useEffect, useState } from "react";
import { getCurrentPlaying, stopPlayback, subscribePlaying } from "./PlayPreview";

export function NowPlaying() {
  const [meta, setMeta] = useState(() => getCurrentPlaying());
  useEffect(() => subscribePlaying(() => setMeta(getCurrentPlaying())), []);
  if (!meta) return null;
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-(--accent)/30 bg-(--surface)/95 px-4 py-2 shadow-2xl backdrop-blur">
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-soft)">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--accent)" />
        playing
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{meta.title}</span>
        <span className="text-(--muted)"> · {meta.artist}</span>
      </span>
      <button
        type="button"
        onClick={() => stopPlayback()}
        className="text-xs text-(--muted) hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
