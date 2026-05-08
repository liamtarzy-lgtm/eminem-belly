// Forgiving answer matching for "Finish the Bar". Normalizes both sides
// (lowercase, strip punctuation, normalize quotes/apostrophes), then
// uses Levenshtein distance for a "close enough" fallback.

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[‘’`´']/g, "") // straight + curly apostrophes
    .replace(/[“”"]/g, "") // double quotes
    .replace(/[^\w\s]/g, " ") // any other punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// Compute Levenshtein distance between two strings.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export type Match = "exact" | "close" | "miss";

// Compares user input against accepted answers and returns match quality.
// Threshold scales with answer length: short answers tolerate fewer typos.
export function checkAnswer(
  input: string,
  accepted: string[],
): { match: Match; bestAnswer: string } {
  const userN = normalizeAnswer(input);
  if (!userN) return { match: "miss", bestAnswer: accepted[0] ?? "" };

  let bestDistance = Infinity;
  let bestAnswer = accepted[0] ?? "";
  for (const ans of accepted) {
    const ansN = normalizeAnswer(ans);
    if (ansN === userN) {
      return { match: "exact", bestAnswer: ans };
    }
    const d = levenshtein(userN, ansN);
    if (d < bestDistance) {
      bestDistance = d;
      bestAnswer = ans;
    }
  }

  // Allow small typos: distance must be ≤ ~15% of the answer length, with
  // a hard cap of 3. So "hi" → "ho" (1 edit, length 2) is close;
  // "hello" → "world" (4 edits, length 5) is a miss.
  const refLen = normalizeAnswer(bestAnswer).length;
  const tolerance = Math.min(3, Math.floor(refLen * 0.15));
  if (bestDistance <= tolerance && bestDistance > 0) {
    return { match: "close", bestAnswer };
  }
  return { match: "miss", bestAnswer };
}
