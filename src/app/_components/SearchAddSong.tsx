"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchSongs, startInsertion, type Song } from "@/lib/ranking/actions";
import { SongImage } from "./SongImage";

export function SearchAddSong() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const songs = await searchSongs(q);
      setResults(songs);
      setSearching(false);
      setOpen(true);
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const reset = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setSearching(false);
    inputRef.current?.blur();
  };

  const onAdd = (songId: number) => {
    setAddingId(songId);
    startTransition(async () => {
      const step = await startInsertion(songId);
      if (step.kind === "compare") {
        router.push("/");
      } else {
        reset();
        router.refresh();
      }
      setAddingId(null);
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") reset();
          }}
          placeholder="Search for an Eminem song..."
          className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 pr-10 outline-none focus:border-(--accent) placeholder:text-(--muted)"
        />
        {query && (
          <button
            type="button"
            onClick={reset}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-(--muted) hover:bg-(--surface-2) hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 max-h-96 overflow-auto rounded-lg border border-(--border) bg-(--surface) shadow-xl">
          {searching && (
            <div className="p-3 text-center text-sm text-(--muted)">
              searching...
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="p-3 text-center text-sm text-(--muted)">
              no matches
            </div>
          )}
          {results.map((song) => (
            <button
              key={song.id}
              type="button"
              disabled={isPending}
              onClick={() => onAdd(song.id)}
              className="flex w-full items-center gap-3 border-b border-(--border) px-3 py-2 text-left last:border-b-0 hover:bg-(--surface-2) disabled:opacity-50"
            >
              <SongImage song={song} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{song.title}</div>
                <div className="truncate text-sm text-(--muted)">
                  {song.primaryArtist}
                  {song.eminemRole === "feature" && " · feat. Eminem"}
                  {song.album && (
                    <span className="text-(--muted)/70"> · {song.album}</span>
                  )}
                </div>
              </div>
              {addingId === song.id ? (
                <span className="text-xs text-(--muted)">adding...</span>
              ) : (
                <span className="text-xs text-(--accent-soft)">add +</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
