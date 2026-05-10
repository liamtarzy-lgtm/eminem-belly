/**
 * Scrapes Genius for a curated list of Eminem songs and writes
 * src/lib/games/lyrics.ts with auto-extracted bar prompts for the
 * "Finish the Bar" game.
 *
 * For each song:
 *   - Fetch https://genius.com/Eminem-{slug}-lyrics (or override URL)
 *   - Extract lyric lines from [data-lyrics-container="true"] blocks
 *   - Pick a few promising couplets (filtered for length, no section
 *     markers, skipping the very first lines)
 *   - Tag with the difficulty assigned to the song
 *
 * Difficulty curation: easy = top-of-mind hits, medium = well-known album
 * cuts, hard = deep cuts and dense rhyme verses. Picked manually so the
 * game has a real progression.
 *
 * Run with: npx tsx scripts/fetch-bars.ts
 * Writes ONLY to src/lib/games/lyrics.ts — no DB writes, no env vars.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Difficulty = "easy" | "medium" | "hard";

type SongSpec = {
  songTitle: string;
  album: string;
  year: number;
  difficulty: Difficulty;
  /** Override slug if it differs from the auto-derived form. */
  slug?: string;
  /** Override full URL if both Eminem-as-primary slug doesn't work. */
  url?: string;
  /**
   * Optional: pin the prompt + answer text exactly. Bypasses scraping
   * for this song entirely. Use when scraping returns junk for a song.
   */
  manualBars?: Array<{ prompt: string; answer: string }>;
};

const SONGS: SongSpec[] = [
  // ── EASY: top-of-mind, anyone who knows Em can finish them ──────────
  { songTitle: "Lose Yourself", album: "8 Mile", year: 2002, difficulty: "easy" },
  { songTitle: "The Real Slim Shady", album: "The Marshall Mathers LP", year: 2000, difficulty: "easy" },
  { songTitle: "Without Me", album: "The Eminem Show", year: 2002, difficulty: "easy" },
  { songTitle: "Stan", album: "The Marshall Mathers LP", year: 2000, difficulty: "easy" },
  { songTitle: "Not Afraid", album: "Recovery", year: 2010, difficulty: "easy" },
  { songTitle: "Love The Way You Lie", album: "Recovery", year: 2010, difficulty: "easy", slug: "love-the-way-you-lie" },
  { songTitle: "Mockingbird", album: "Encore", year: 2004, difficulty: "easy" },
  { songTitle: "When I'm Gone", album: "Curtain Call", year: 2005, difficulty: "easy", slug: "when-im-gone" },
  // ── MEDIUM: well-known album cuts ─────────────────────────────────────
  { songTitle: "Cleanin' Out My Closet", album: "The Eminem Show", year: 2002, difficulty: "medium", slug: "cleanin-out-my-closet" },
  { songTitle: "Sing for the Moment", album: "The Eminem Show", year: 2002, difficulty: "medium" },
  { songTitle: "Like Toy Soldiers", album: "Encore", year: 2004, difficulty: "medium" },
  { songTitle: "Beautiful", album: "Relapse", year: 2009, difficulty: "medium" },
  { songTitle: "Forgot About Dre", album: "2001", year: 1999, difficulty: "medium", url: "https://genius.com/Dr-dre-forgot-about-dre-lyrics" },
  {
    songTitle: "Killshot",
    album: "Singles",
    year: 2018,
    difficulty: "medium",
    manualBars: [
      {
        prompt: "I'm the bull, and you just got a couple of",
        answer: "Red dots on you, you the matador",
      },
    ],
  },
  {
    songTitle: "My Name Is",
    album: "The Slim Shady LP",
    year: 1999,
    difficulty: "easy",
    manualBars: [
      {
        prompt: "Hi, kids! Do you like violence?",
        answer: "Wanna see me stick nine-inch nails through each one of my eyelids?",
      },
      {
        prompt: "I just drank a fifth of vodka",
        answer: "Dare me to drive?",
      },
    ],
  },
  { songTitle: "'Till I Collapse", album: "The Eminem Show", year: 2002, difficulty: "medium", slug: "till-i-collapse" },
  { songTitle: "The Way I Am", album: "The Marshall Mathers LP", year: 2000, difficulty: "medium" },
  { songTitle: "Superman", album: "The Eminem Show", year: 2002, difficulty: "medium" },
  // ── HARD: deep cuts and dense verses ─────────────────────────────────
  { songTitle: "Rap God", album: "The Marshall Mathers LP 2", year: 2013, difficulty: "hard" },
  { songTitle: "Renegade", album: "The Blueprint", year: 2001, difficulty: "hard", url: "https://genius.com/Jay-z-renegade-lyrics" },
  { songTitle: "Drug Ballad", album: "The Marshall Mathers LP", year: 2000, difficulty: "hard" },
  { songTitle: "Yellow Brick Road", album: "Encore", year: 2004, difficulty: "hard" },
  { songTitle: "Brain Damage", album: "The Slim Shady LP", year: 1999, difficulty: "hard" },
  { songTitle: "White America", album: "The Eminem Show", year: 2002, difficulty: "hard" },
  { songTitle: "Square Dance", album: "The Eminem Show", year: 2002, difficulty: "hard" },
  { songTitle: "Soldier", album: "The Eminem Show", year: 2002, difficulty: "hard" },
  { songTitle: "No Love", album: "Recovery", year: 2010, difficulty: "hard" },
  { songTitle: "Godzilla", album: "Music To Be Murdered By", year: 2020, difficulty: "hard" },
];

function autoSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function urlFor(spec: SongSpec): string {
  if (spec.url) return spec.url;
  const slug = spec.slug ?? autoSlug(spec.songTitle);
  return `https://genius.com/Eminem-${slug}-lyrics`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractLyricLines(html: string): string[] {
  // Match all lyric containers; lyrics are wrapped in
  // <div data-lyrics-container="true" class="...">...</div>
  const blocks: string[] = [];
  const re = /<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1]);
  }
  if (blocks.length === 0) return [];
  // Stitch blocks (some songs split across containers), normalize <br>, strip tags
  let raw = blocks.join("\n");
  raw = raw.replace(/<br\s*\/?>(\r?\n)?/gi, "\n");
  raw = raw.replace(/<\/p>/gi, "\n");
  raw = raw.replace(/<[^>]+>/g, "");
  raw = decodeHtmlEntities(raw);
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function isSectionHeader(line: string): boolean {
  return /^\[.+\]$/.test(line);
}

function wordCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).length;
}

function looksLikeBar(line: string): boolean {
  const wc = wordCount(line);
  if (wc < 3 || wc > 15) return false;
  if (line.length < 14) return false;
  if (isSectionHeader(line)) return false;
  // Skip lines that are all-caps shouts or mostly punctuation
  const punctRatio = (line.match(/[^\w\s]/g)?.length ?? 0) / line.length;
  if (punctRatio > 0.25) return false;
  return true;
}

function pickCouplets(
  lines: string[],
  count: number,
): Array<{ prompt: string; answer: string }> {
  // Skip the first 4 lines (often [Verse] markers + intro shout) and last 2.
  const window = lines.slice(0, Math.max(lines.length - 2, 0));
  const couplets: Array<{ prompt: string; answer: string; idx: number }> = [];
  for (let i = 4; i < window.length - 1; i++) {
    const a = window[i];
    const b = window[i + 1];
    if (!looksLikeBar(a) || !looksLikeBar(b)) continue;
    if (isSectionHeader(window[i - 1] ?? "")) continue; // skip first line of section
    couplets.push({ prompt: a, answer: b, idx: i });
  }
  // Spread out by index so we don't pick adjacent couplets, and never pick
  // two couplets that share a prompt or answer (covers chorus repeats).
  const picked: Array<{ prompt: string; answer: string }> = [];
  const seenIdx = new Set<number>();
  const seenText = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").trim();
  for (const c of couplets) {
    if (picked.length >= count) break;
    if ([...seenIdx].some((s) => Math.abs(s - c.idx) < 4)) continue;
    const pKey = norm(c.prompt);
    const aKey = norm(c.answer);
    if (seenText.has(pKey) || seenText.has(aKey)) continue;
    seenIdx.add(c.idx);
    seenText.add(pKey);
    seenText.add(aKey);
    picked.push({ prompt: c.prompt, answer: c.answer });
  }
  return picked;
}

async function fetchPage(url: string, retries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === retries) {
        console.error(`  ✗ fetch failed: ${e}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return null;
}

async function main() {
  const outBars: Array<{
    id: string;
    songTitle: string;
    album: string;
    year: number;
    difficulty: Difficulty;
    promptText: string;
    acceptedAnswers: string[];
  }> = [];

  for (let i = 0; i < SONGS.length; i++) {
    const s = SONGS[i];
    console.log(`\n[${i + 1}/${SONGS.length}] ${s.songTitle} (${s.difficulty})`);
    let bars: Array<{ prompt: string; answer: string }> = [];
    if (s.manualBars) {
      bars = s.manualBars;
      console.log(`  manual: ${bars.length} bar${bars.length === 1 ? "" : "s"}`);
    } else {
      const url = urlFor(s);
      console.log(`  ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        console.log("  ✗ no page");
        continue;
      }
      const lines = extractLyricLines(html);
      console.log(`  ${lines.length} lines extracted`);
      bars = pickCouplets(lines, s.difficulty === "easy" ? 2 : 1);
      console.log(`  picked ${bars.length} couplet${bars.length === 1 ? "" : "s"}`);
      // tiny rate-limit
      await new Promise((r) => setTimeout(r, 600));
    }
    let n = 0;
    for (const b of bars) {
      const id = `${autoSlug(s.songTitle)}-${++n}`;
      outBars.push({
        id,
        songTitle: s.songTitle,
        album: s.album,
        year: s.year,
        difficulty: s.difficulty,
        promptText: b.prompt,
        acceptedAnswers: [b.answer],
      });
      console.log(`   ↳ "${b.prompt}" → "${b.answer}"`);
    }
  }

  console.log(`\n\n✓ Wrote ${outBars.length} bars across ${SONGS.length} songs`);
  console.log(`  easy: ${outBars.filter((b) => b.difficulty === "easy").length}`);
  console.log(`  medium: ${outBars.filter((b) => b.difficulty === "medium").length}`);
  console.log(`  hard: ${outBars.filter((b) => b.difficulty === "hard").length}`);

  const fileBody = `import type { Lyric } from "./types";

// Auto-fetched from Genius by scripts/fetch-bars.ts. Re-run that script
// to refresh. Do NOT hand-edit individual entries — your changes will
// be wiped next time the script runs.
export const LYRICS: Lyric[] = ${JSON.stringify(outBars, null, 2)};
`;
  const outPath = join(process.cwd(), "src/lib/games/lyrics.ts");
  writeFileSync(outPath, fileBody, "utf8");
  console.log(`→ Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
