"use client";

import { useState } from "react";

type Item = { title: string; artist: string };

export function ExportToMusic({ songs }: { songs: Item[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"plain" | "spotify-search" | null>(
    null,
  );

  if (songs.length === 0) return null;

  // Plain "Title - Artist" — the format TuneMyMusic / Soundiiz / SongShift
  // accept under their "Plain text" / "Custom" import option.
  const plainList = songs.map((s) => `${s.title} - ${s.artist}`).join("\n");

  const copy = async (text: string, key: "plain" | "spotify-search") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked — user can still select + copy manually
    }
  };

  return (
    <div className="rounded-xl border border-(--border) bg-(--surface)">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">🍎</div>
          <div>
            <div className="text-sm font-semibold">Export to Apple Music</div>
            <div className="text-xs text-(--muted)">
              {songs.length} saved song{songs.length === 1 ? "" : "s"} →
              consolidated playlist
            </div>
          </div>
        </div>
        <div className="text-(--muted)">{open ? "▲" : "▼"}</div>
      </button>

      {open && (
        <div className="border-t border-(--border) p-4 sm:p-5 flex flex-col gap-4">
          <div className="text-xs text-(--muted) leading-relaxed">
            Apple doesn&apos;t let us create playlists on your account directly
            (their rules require an Apple Developer account, $99/yr — out of
            scope). The next-best path: copy this list, paste it into a free
            transfer service, and they&apos;ll build the playlist on your
            Apple Music account.
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
                Your saved songs
              </div>
              <button
                type="button"
                onClick={() => copy(plainList, "plain")}
                className="rounded-md border border-(--border) bg-(--surface-2) px-3 py-1 text-xs font-medium hover:border-(--accent-soft)"
              >
                {copied === "plain" ? "✓ copied" : "copy list"}
              </button>
            </div>
            <textarea
              readOnly
              value={plainList}
              className="h-40 w-full resize-none rounded-md border border-(--border) bg-(--background) p-3 font-mono text-xs leading-relaxed"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-(--border) bg-(--background) p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-(--accent-soft)">
              How to import (free, ~2 min)
            </div>
            <ol className="ml-4 list-decimal text-sm leading-relaxed marker:text-(--muted)">
              <li>
                Tap <span className="font-medium">Copy list</span> above.
              </li>
              <li>
                Open{" "}
                <a
                  href="https://www.tunemymusic.com/transfer"
                  target="_blank"
                  rel="noreferrer"
                  className="text-(--accent-soft) underline hover:text-foreground"
                >
                  TuneMyMusic.com
                </a>{" "}
                (free, supports up to 500 tracks per transfer).
              </li>
              <li>
                <span className="font-medium">Source</span> → choose{" "}
                <span className="font-medium">Plain text</span> → paste your list.
              </li>
              <li>
                <span className="font-medium">Destination</span> → choose{" "}
                <span className="font-medium">Apple Music</span> → sign in with
                your Apple Music account.
              </li>
              <li>
                Confirm. TuneMyMusic creates the playlist on your Apple Music
                account.
              </li>
            </ol>
            <div className="text-[11px] text-(--muted)">
              Alternatives: Soundiiz, SongShift (iOS app). All accept the same
              plain-text format.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
