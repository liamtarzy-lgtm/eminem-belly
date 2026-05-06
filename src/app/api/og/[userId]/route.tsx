import { ImageResponse } from "next/og";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getRanking, withDisplayRanks } from "@/lib/ranking/queries";
import { rankToScore, formatScore } from "@/lib/score";

export const runtime = "nodejs";

const ACCENT = "#d70000";
const ACCENT_SOFT = "#ff5959";
const GOLD = "#fbbf24";
const BG = "#0a0a0a";
const SURFACE = "#161616";
const SURFACE_2 = "#1f1f1f";
const BORDER = "#2c2c2c";
const MUTED = "#7a7a7a";

function colorFor(score: number): string {
  if (score >= 8) return GOLD;
  if (score >= 6.5) return ACCENT_SOFT;
  if (score >= 4) return "#e5e5e5";
  if (score >= 2) return "#9a9a9a";
  return "#5a5a5a";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "top10";

  const user = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return new Response("Not found", { status: 404 });

  const ranking = await getRanking(userId);
  const total = ranking.length;
  const ranked = withDisplayRanks(ranking);
  const displayName = (user.name ?? "Someone").slice(0, 30);

  if (view === "tiers") return tiersImage(displayName, ranked, total);
  if (view === "full") return fullListImage(displayName, ranked, total);
  return top10Image(displayName, ranked, total);
}

type Ranked = ReturnType<typeof withDisplayRanks>;

// Top 10 layout (1200×630) — punchy podium #1 + 9 row list
function top10Image(name: string, ranked: Ranked, total: number) {
  const top10 = ranked.slice(0, 10);
  const number1 = top10[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `radial-gradient(circle at top right, ${SURFACE} 0%, ${BG} 60%)`,
          color: "white",
          fontFamily: "sans-serif",
          padding: "44px 52px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            <span>EMINEM</span>
            <span style={{ color: ACCENT, margin: "0 10px" }}>·</span>
            <span>BELLY</span>
          </div>
          <div
            style={{
              fontSize: 15,
              color: MUTED,
              display: "flex",
              fontFamily: "monospace",
            }}
          >
            {total} song{total === 1 ? "" : "s"} ranked
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 24,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: ACCENT_SOFT,
                display: "flex",
              }}
            >
              top 10
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                lineHeight: 0.95,
                marginTop: 6,
                display: "flex",
                letterSpacing: "-0.02em",
              }}
            >
              {name}&apos;s
            </div>
            {number1 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: GOLD,
                    display: "flex",
                  }}
                >
                  #1 — {formatScore(rankToScore(number1.displayRank, total))}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    lineHeight: 1.05,
                    marginTop: 4,
                    display: "flex",
                  }}
                >
                  {number1.song.title.slice(0, 32)}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: MUTED,
                    marginTop: 2,
                    display: "flex",
                  }}
                >
                  {number1.song.primaryArtist.slice(0, 32)}
                </div>
              </div>
            )}
          </div>
          {number1?.song.artUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={number1.song.artUrl}
              width={220}
              height={220}
              style={{
                borderRadius: 16,
                border: `3px solid ${GOLD}`,
                boxShadow: `0 0 60px rgba(251,191,36,0.25)`,
              }}
              alt=""
            />
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flex: 1,
          }}
        >
          {top10.slice(1).map((r) => {
            const score = rankToScore(r.displayRank, total);
            return (
              <div
                key={r.song.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: MUTED,
                    textAlign: "center",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  {r.displayRank}
                </div>
                {r.song.artUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.song.artUrl}
                    width={36}
                    height={36}
                    style={{ borderRadius: 6 }}
                    alt=""
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: SURFACE_2,
                      display: "flex",
                    }}
                  />
                )}
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    flex: 1,
                    display: "flex",
                  }}
                >
                  {r.song.title.slice(0, 50)}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: MUTED,
                    display: "flex",
                    minWidth: 100,
                    justifyContent: "flex-end",
                  }}
                >
                  {r.song.primaryArtist.slice(0, 18)}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: colorFor(score),
                    minWidth: 50,
                    textAlign: "right",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  {formatScore(score)}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            fontSize: 13,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>eminem-belly.vercel.app</div>
          <div style={{ display: "flex", color: ACCENT_SOFT }}>↗ rank yours</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

// Full list image — 2 columns when N > 25
function fullListImage(name: string, ranked: Ranked, total: number) {
  const ROW_H = 36;
  const COLS = ranked.length > 25 ? 2 : 1;
  const rowsPerCol = Math.ceil(ranked.length / COLS);
  const height = Math.min(4000, 200 + rowsPerCol * (ROW_H + 4) + 100);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: "white",
          fontFamily: "sans-serif",
          padding: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            <span>EMINEM</span>
            <span style={{ color: ACCENT, margin: "0 10px" }}>·</span>
            <span>BELLY</span>
          </div>
          <div style={{ fontSize: 14, color: MUTED, display: "flex" }}>
            {total} ranked
          </div>
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1,
            display: "flex",
          }}
        >
          {name}&apos;s full ranking
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 18,
            flex: 1,
          }}
        >
          {Array.from({ length: COLS }).map((_, colIdx) => {
            const start = colIdx * rowsPerCol;
            const end = start + rowsPerCol;
            const slice = ranked.slice(start, end);
            return (
              <div
                key={colIdx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: 4,
                }}
              >
                {slice.map((r) => {
                  const score = rankToScore(r.displayRank, total);
                  return (
                    <div
                      key={r.song.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "4px 8px",
                        height: ROW_H,
                        borderRadius: 6,
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: MUTED,
                          textAlign: "right",
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        {r.displayRank}
                      </div>
                      {r.song.artUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.song.artUrl}
                          width={24}
                          height={24}
                          style={{ borderRadius: 3 }}
                          alt=""
                        />
                      ) : (
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 3,
                            background: SURFACE_2,
                            display: "flex",
                          }}
                        />
                      )}
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          flex: 1,
                          display: "flex",
                        }}
                      >
                        {r.song.title.slice(0, 40)}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: colorFor(score),
                          display: "flex",
                        }}
                      >
                        {formatScore(score)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 13,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>eminem-belly.vercel.app</div>
          <div style={{ display: "flex", color: ACCENT_SOFT }}>↗ rank yours</div>
        </div>
      </div>
    ),
    { width: 1200, height },
  );
}

// Tier list image — songs grouped by score band
const TIERS = [
  { letter: "S", min: 9, label: "Untouchable", color: "#facc15" },
  { letter: "A", min: 7.5, label: "Heat", color: "#fb923c" },
  { letter: "B", min: 6, label: "Solid", color: "#dc2626" },
  { letter: "C", min: 4.5, label: "OK", color: "#a3a3a3" },
  { letter: "D", min: 3, label: "Skip", color: "#525252" },
  { letter: "F", min: 0, label: "Mid", color: "#404040" },
];

function tiersImage(name: string, ranked: Ranked, total: number) {
  const buckets: Ranked[] = TIERS.map(() => []);
  for (const r of ranked) {
    const score = rankToScore(r.displayRank, total);
    const idx = TIERS.findIndex((t) => score >= t.min);
    if (idx >= 0) buckets[idx].push(r);
  }
  const visible = TIERS.map((t, i) => ({ tier: t, songs: buckets[i] })).filter(
    (b) => b.songs.length > 0,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: "white",
          fontFamily: "sans-serif",
          padding: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            <span>EMINEM</span>
            <span style={{ color: ACCENT, margin: "0 10px" }}>·</span>
            <span>BELLY</span>
          </div>
          <div style={{ fontSize: 14, color: MUTED, display: "flex" }}>
            tier list
          </div>
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1,
            display: "flex",
            marginBottom: 20,
          }}
        >
          {name}&apos;s tiers
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flex: 1,
          }}
        >
          {visible.map(({ tier, songs }) => (
            <div
              key={tier.letter}
              style={{
                display: "flex",
                overflow: "hidden",
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: SURFACE,
              }}
            >
              <div
                style={{
                  width: 88,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "12px 6px",
                  background: tier.color,
                  color: "#0a0a0a",
                }}
              >
                <div
                  style={{
                    fontSize: 38,
                    fontWeight: 900,
                    lineHeight: 1,
                    display: "flex",
                  }}
                >
                  {tier.letter}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    marginTop: 2,
                    display: "flex",
                  }}
                >
                  {tier.label}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  padding: 10,
                  flex: 1,
                }}
              >
                {songs.slice(0, 18).map((r) =>
                  r.song.artUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={r.song.id}
                      src={r.song.artUrl}
                      width={56}
                      height={56}
                      style={{ borderRadius: 6 }}
                      alt=""
                    />
                  ) : (
                    <div
                      key={r.song.id}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 6,
                        background: SURFACE_2,
                        display: "flex",
                      }}
                    />
                  ),
                )}
                {songs.length > 18 && (
                  <div
                    style={{
                      fontSize: 14,
                      color: MUTED,
                      display: "flex",
                    }}
                  >
                    +{songs.length - 18} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 13,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>eminem-belly.vercel.app</div>
          <div style={{ display: "flex", color: ACCENT_SOFT }}>↗ rank yours</div>
        </div>
      </div>
    ),
    { width: 1200, height: 1000 },
  );
}
