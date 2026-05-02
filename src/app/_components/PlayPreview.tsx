"use client";

import { useEffect, useRef, useState } from "react";

// Module-level singleton: only one preview plays at a time across the page.
let currentlyPlaying: HTMLAudioElement | null = null;
const subscribers = new Set<() => void>();
function notifyAll() {
  for (const fn of subscribers) fn();
}

type Props = {
  /** The song id — the audio src points at /api/preview/[songId] which
   *  resolves a fresh signed URL from Deezer at play time. */
  songId: number;
  /** Whether we know the song has a preview available; if false, the button
   *  is hidden so we don't show non-functional UI. */
  hasPreview: boolean;
  /** Visual size of the round button. */
  size?: "sm" | "md";
  /** Extra classes for positioning (e.g. absolute placement). */
  className?: string;
};

export function PlayPreview({ songId, hasPreview, size = "md", className = "" }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [, force] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      if (currentlyPlaying === audio) currentlyPlaying = null;
      setLoading(false);
      notifyAll();
    };
    const onPause = () => {
      if (currentlyPlaying === audio) currentlyPlaying = null;
      setLoading(false);
      notifyAll();
    };
    const onError = () => {
      setLoading(false);
      if (currentlyPlaying === audio) currentlyPlaying = null;
      notifyAll();
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      if (currentlyPlaying === audio) {
        audio.pause();
        currentlyPlaying = null;
      }
    };
  }, []);

  if (!hasPreview) return null;

  const playing = currentlyPlaying === audioRef.current && audioRef.current !== null;
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base sm:h-12 sm:w-12";

  const toggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (currentlyPlaying === audio) {
      audio.pause();
      currentlyPlaying = null;
      notifyAll();
      return;
    }
    if (currentlyPlaying) currentlyPlaying.pause();
    setLoading(true);
    audio.src = `/api/preview/${songId}?t=${Date.now()}`;
    audio.currentTime = 0;
    audio
      .play()
      .then(() => {
        currentlyPlaying = audio;
        setLoading(false);
        notifyAll();
      })
      .catch(() => {
        currentlyPlaying = null;
        setLoading(false);
        notifyAll();
      });
  };

  const icon = loading ? "···" : playing ? "❚❚" : "▶";

  return (
    <>
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={playing ? "Pause preview" : "Play 30s preview"}
        className={`${className} ${dim} flex items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/85 active:scale-95`}
      >
        <span aria-hidden>{icon}</span>
      </button>
    </>
  );
}
