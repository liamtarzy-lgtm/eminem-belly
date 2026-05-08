// Per-song Apple Music search deep link. On iPhone the URL opens directly
// in the Apple Music app (where the user can tap "Add to Library"). On
// desktop it opens music.apple.com in a new tab.
export function AppleMusicLink({
  title,
  artist,
  className = "",
}: {
  title: string;
  artist: string;
  className?: string;
}) {
  const query = encodeURIComponent(`${title} ${artist}`);
  const href = `https://music.apple.com/search?term=${query}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${title} on Apple Music`}
      title="Open in Apple Music"
      className={`flex h-7 w-7 items-center justify-center rounded-md border border-(--border) bg-(--surface-2) text-xs text-(--muted) hover:border-(--accent-soft) hover:text-foreground ${className}`}
    >
      🍎
    </a>
  );
}
