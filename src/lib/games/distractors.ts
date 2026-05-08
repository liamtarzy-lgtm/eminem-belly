import type { CatalogEntry } from "./queries";

// Generate three plausible wrong answers for a given correct song.
// Similarity is scored across album / era / role; the top candidates are
// shuffled within their tier so the same wrong choice doesn't reappear
// every round.
export function pickDistractors(
  correct: { id: number; album: string | null; year: number | null; eminemRole: "primary" | "feature" },
  catalog: CatalogEntry[],
  correctTitle: string,
): [string, string, string] {
  const pool = catalog.filter(
    (c) => c.id !== correct.id && c.title !== correctTitle,
  );

  function score(c: CatalogEntry): number {
    let s = 0;
    if (correct.album && c.album === correct.album) s += 6;
    if (
      correct.year !== null &&
      c.year !== null &&
      Math.abs(c.year - correct.year) <= 2
    )
      s += 4;
    else if (
      correct.year !== null &&
      c.year !== null &&
      Math.abs(c.year - correct.year) <= 5
    )
      s += 2;
    if (c.eminemRole === correct.eminemRole) s += 1;
    // Tiny random jitter so identical-score candidates rotate
    s += Math.random();
    return s;
  }

  const ranked = [...pool].sort((a, b) => score(b) - score(a));
  // De-dupe by title (catalog can have multiple rows with the same title
  // due to features, etc.) and take the top 3.
  const seen = new Set<string>([correctTitle]);
  const picks: string[] = [];
  for (const c of ranked) {
    if (seen.has(c.title)) continue;
    seen.add(c.title);
    picks.push(c.title);
    if (picks.length === 3) break;
  }
  // Fallbacks in case we didn't have 3 candidates (very small catalog)
  while (picks.length < 3) picks.push(`(no alternate)`);
  return [picks[0], picks[1], picks[2]];
}
