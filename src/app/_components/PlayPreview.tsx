"use client";

import { useEffect, useRef, useState } from "react";

// Module-level singleton: only one preview plays at a time. We also store
// metadata so a sibling NowPlaying indicator can label the current track.
type Current = {
  audio: HTMLAudioElement;
  meta: { songId: number; title: string; artist: string };
};
let current: Current | null = null;
const subscribers = new Set<() => void>();
function notifyAll() {
  for (const fn of subscribers) fn();
}

export function getCurrentPlaying(): Current["meta"] | null {
  return current?.meta ?? null;
}

export function subscribePlaying(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function stopPlayback() {
  if (current) {
    current.audio.pause();
    current = null;
    notifyAll();
  }
}

type Props = {
  songId: number;
  hasPreview: boolean;
  title: string;
  artist: string;
  size?: "sm" | "md";
  className?: string;
};

export function PlayPreview({
  songId,
  hasPreview,
  title,
  artist,
  size = "md",
  className = "",
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [, force] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return subscribePlaying(() => force((n) => n + 1));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => {
      if (current?.audio === audio) current = null;
      setLoading(false);
      notifyAll();
    };
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onEnd);
    audio.addEventListener("error", onEnd);
    return () => {
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onEnd);
      audio.removeEventListener("error", onEnd);
      // If we're unmounting while this audio is the active one, clear the
      // singleton AND notify subscribers so the NowPlaying pill hides too.
      if (current?.audio === audio) {
        audio.pause();
        current = null;
        notifyAll();
      }
    };
  }, []);

  if (!hasPreview) return null;

  const playing = current?.audio === audioRef.current && audioRef.current !== null;
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base sm:h-12 sm:w-12";

  const toggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (current?.audio === audio) {
      audio.pause();
      current = null;
      notifyAll();
      return;
    }
    if (current) current.audio.pause();
    setLoading(true);
    audio.src = `/api/preview/${songId}?t=${Date.now()}`;
    audio.currentTime = 0;
    audio
      .play()
      .then(() => {
        current = { audio, meta: { songId, title, artist } };
        setLoading(false);
        notifyAll();
      })
      .catch(() => {
        current = null;
        setLoading(false);
        notifyAll();
      });
  };

  const icon = loading ? "···" : playing ? "❚❚" : "▶";

  return (
    <>
      <audio ref={audioRef} preload="none" />
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
