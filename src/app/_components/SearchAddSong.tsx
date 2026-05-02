"use client";

import { useEffect, useState, useTransition } from "react";
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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
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

  const onAdd = (songId: number) => {
    setAddingId(songId);
    startTransition(async () => {
      const step = await startInsertion(songId);
      if (step.kind === "compare") {
        router.push("/");
      } else {
        setQuery("");
        setResults([]);
        setOpen(false);
        router.refresh();
      }
      setAddingId(null);
    });
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search for an Eminem song to add..."
        className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--accent) placeholder:text-(--muted)"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-10 max-h-96 overflow-auto rounded-lg border border-(--border) bg-(--surface) shadow-xl">
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
