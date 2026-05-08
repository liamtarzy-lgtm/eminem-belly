"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addSegment, deleteSegment } from "@/lib/games/segments";

type Props = {
  songId: number;
  audioSrc: string;
  segments: Array<{ start: number; end: number; confidence?: string }>;
};

export function SegmentEditor({ songId, audioSrc, segments }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [start, setStart] = useState(5);
  const [end, setEnd] = useState(7);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stopAtRef = useRef<number | null>(null);

  // Audio init
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration || 30);
    const onTime = () => {
      setNow(audio.currentTime);
      if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
        audio.pause();
        stopAtRef.current = null;
      }
    };
    const onEnd = () => setPlaying(false);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.src = audioSrc;
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.pause();
    };
  }, [audioSrc]);

  function playRange(s: number, e: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = s;
    stopAtRef.current = e;
    audio.play().catch(() => setError("Audio playback was blocked or failed."));
  }

  function playFull() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    stopAtRef.current = null;
    audio.play().catch(() => setError("Audio playback was blocked or failed."));
  }

  function stop() {
    audioRef.current?.pause();
    stopAtRef.current = null;
  }

  function setStartHere() {
    const t = audioRef.current?.currentTime ?? 0;
    setStart(Number(t.toFixed(2)));
    setEnd(Number((t + 2).toFixed(2)));
  }

  function setEndHere() {
    const t = audioRef.current?.currentTime ?? 0;
    setEnd(Number(t.toFixed(2)));
  }

  function nudgeStart(delta: number) {
    setStart((s) => Math.max(0, Math.min(duration, Number((s + delta).toFixed(2)))));
  }
  function nudgeEnd(delta: number) {
    setEnd((e) => Math.max(0, Math.min(duration, Number((e + delta).toFixed(2)))));
  }

  function save() {
    if (end <= start) {
      setError("End must be after start.");
      return;
    }
    if (end - start > 3) {
      setError("Segment is over 3s. Pick a tighter window (~2s).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addSegment(songId, start, end);
      if (!r.ok) setError(r.error ?? "Save failed");
    });
  }

  function remove(idx: number) {
    startTransition(async () => {
      await deleteSegment(songId, idx);
    });
  }

  const playheadPct = duration > 0 ? (now / duration) * 100 : 0;
  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} preload="metadata" />

      {/* Audio scrubber visualization */}
      <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
        <div className="relative h-12 w-full overflow-hidden rounded-md bg-(--surface-2)">
          {/* selected segment band */}
          <div
            className="absolute inset-y-0 bg-(--accent)/30"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          {/* playhead */}
          <div
            className="absolute inset-y-0 w-0.5 bg-emerald-400"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-(--muted) tabular-nums">
          <span>{now.toFixed(1)}s</span>
          <span>duration: {duration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={playing ? stop : playFull}
          className="rounded-md border border-(--border) bg-(--surface-2) px-3 py-2 text-sm hover:border-(--accent-soft)"
        >
          {playing ? "■ stop" : "▶ play full preview"}
        </button>
        <button
          type="button"
          onClick={() => playRange(start, end)}
          className="rounded-md border border-(--accent)/50 bg-(--accent)/10 px-3 py-2 text-sm font-medium text-(--accent-soft) hover:border-(--accent)"
        >
          ▶ play selected ({(end - start).toFixed(1)}s)
        </button>
      </div>

      {/* Segment selectors */}
      <div className="grid grid-cols-2 gap-3">
        <Selector
          label="start"
          value={start}
          max={duration}
          onChange={setStart}
          onNudge={nudgeStart}
          extraButton={{ label: "set ⇡", onClick: setStartHere }}
        />
        <Selector
          label="end"
          value={end}
          max={duration}
          onChange={setEnd}
          onNudge={nudgeEnd}
          extraButton={{ label: "set ⇡", onClick: setEndHere }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-(--muted)">
          target ~2s. selected: {(end - start).toFixed(2)}s
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-(--accent) px-4 py-2 font-semibold text-white hover:bg-(--accent-soft) disabled:opacity-50"
        >
          {pending ? "saving…" : "save segment"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Existing segments */}
      <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
          saved segments ({segments.length})
        </div>
        {segments.length === 0 ? (
          <div className="text-sm text-(--muted)">
            None yet. Pick a window where Eminem is rapping and save it.
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {segments.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-(--border) bg-(--surface-2) px-3 py-2 text-sm"
              >
                <span className="font-mono">
                  {s.start.toFixed(2)}s → {s.end.toFixed(2)}s
                  <span className="ml-2 text-(--muted)">
                    ({(s.end - s.start).toFixed(2)}s)
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => playRange(s.start, s.end)}
                    className="text-(--accent-soft) hover:text-foreground"
                  >
                    ▶ preview
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={pending}
                    className="text-rose-400 hover:text-rose-300 disabled:opacity-50"
                  >
                    delete
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  max,
  onChange,
  onNudge,
  extraButton,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  onNudge: (delta: number) => void;
  extraButton?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-lg border border-(--border) bg-(--surface) p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
          {label}
        </div>
        {extraButton && (
          <button
            type="button"
            onClick={extraButton.onClick}
            className="text-[10px] uppercase tracking-wider text-(--accent-soft) hover:text-foreground"
          >
            {extraButton.label}
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNudge(-0.5)}
          aria-label={`${label} -0.5s`}
          className="rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-xs text-(--muted) hover:text-foreground"
        >
          −.5
        </button>
        <button
          type="button"
          onClick={() => onNudge(-0.1)}
          aria-label={`${label} -0.1s`}
          className="rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-xs text-(--muted) hover:text-foreground"
        >
          −.1
        </button>
        <input
          type="number"
          min={0}
          max={max || 30}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-md border border-(--border) bg-(--background) px-2 py-1 text-center font-mono text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={() => onNudge(0.1)}
          aria-label={`${label} +0.1s`}
          className="rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-xs text-(--muted) hover:text-foreground"
        >
          +.1
        </button>
        <button
          type="button"
          onClick={() => onNudge(0.5)}
          aria-label={`${label} +0.5s`}
          className="rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-xs text-(--muted) hover:text-foreground"
        >
          +.5
        </button>
      </div>
    </div>
  );
}
