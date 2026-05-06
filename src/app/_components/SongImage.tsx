import Image from "next/image";
import type { Song } from "@/lib/ranking/actions";

type Size = "sm" | "md" | "lg";

const dims: Record<Size, { box: string; px: number }> = {
  sm: { box: "h-12 w-12", px: 96 },
  md: { box: "h-24 w-24", px: 192 },
  // Smaller on mobile (140px) so two stacked compare cards fit in one screen;
  // jumps to ~280px on desktop where vertical space is plentiful.
  lg: { box: "h-36 w-36 sm:h-72 sm:w-72", px: 600 },
};

export function SongImage({
  song,
  size = "md",
}: {
  song: Pick<Song, "artUrl" | "title">;
  size?: Size;
}) {
  const d = dims[size];
  if (!song.artUrl) {
    return (
      <div
        className={`${d.box} flex items-center justify-center rounded-lg bg-(--surface-2) text-(--muted) text-xs uppercase tracking-wider`}
      >
        no art
      </div>
    );
  }
  return (
    <Image
      src={song.artUrl}
      alt={song.title}
      width={d.px}
      height={d.px}
      className={`${d.box} rounded-lg object-cover`}
      unoptimized
    />
  );
}
