import { ImageResponse } from "next/og";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getRanking, withDisplayRanks } from "@/lib/ranking/queries";
import { rankToScore, formatScore } from "@/lib/score";

export const runtime = "nodejs";

const ACCENT = "#d70000";
const ACCENT_SOFT = "#ff5959";
const BG = "#0a0a0a";
const SURFACE = "#161616";
const SURFACE_2 = "#222222";
const BORDER = "#2c2c2c";
const MUTED = "#8c8c8c";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const user = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  const ranking = await getRanking(userId);
  const total = ranking.length;
  const top10 = withDisplayRanks(ranking).slice(0, 10);

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
          padding: "48px 56px",
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "white",
              display: "flex",
            }}
          >
            <span>Eminem</span>
            <span style={{ color: ACCENT, margin: "0 12px" }}>·</span>
            <span>Belly</span>
          </div>
          <div
            style={{
              fontSize: 16,
              color: MUTED,
              display: "flex",
            }}
          >
            ranked from {total} song{total === 1 ? "" : "s"}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 18,
              color: ACCENT_SOFT,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            top 10
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              lineHeight: 1.05,
              marginTop: 4,
              display: "flex",
            }}
          >
            {(user.name ?? "Someone").slice(0, 30)}&apos;s
          </div>
        </div>

        {/* Songs list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flex: 1,
          }}
        >
          {top10.length === 0 && (
            <div
              style={{
                display: "flex",
                color: MUTED,
                fontSize: 24,
                padding: 60,
                justifyContent: "center",
              }}
            >
              no songs ranked yet
            </div>
          )}
          {top10.map((r, idx) => {
            const score = rankToScore(r.displayRank, total);
            const isTop = idx === 0;
            return (
              <div
                key={r.song.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "10px 16px",
                  borderRadius: 12,
                  background: isTop
                    ? "linear-gradient(90deg, rgba(215,0,0,0.18), rgba(22,22,22,1))"
                    : SURFACE,
                  border: `1px solid ${isTop ? ACCENT : BORDER}`,
                }}
              >
                <div
                  style={{
                    width: 44,
                    fontSize: isTop ? 32 : 24,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: isTop ? ACCENT_SOFT : MUTED,
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
                    width={isTop ? 56 : 44}
                    height={isTop ? 56 : 44}
                    style={{ borderRadius: 8 }}
                    alt=""
                  />
                ) : (
                  <div
                    style={{
                      width: isTop ? 56 : 44,
                      height: isTop ? 56 : 44,
                      borderRadius: 8,
                      background: SURFACE_2,
                      display: "flex",
                    }}
                  />
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: isTop ? 26 : 22,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      display: "flex",
                    }}
                  >
                    {r.song.title.slice(0, 60)}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: MUTED,
                      marginTop: 2,
                      display: "flex",
                    }}
                  >
                    {r.song.primaryArtist.slice(0, 60)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: isTop ? 32 : 24,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: isTop ? ACCENT_SOFT : "white",
                    display: "flex",
                  }}
                >
                  {formatScore(score)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            fontSize: 14,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>rank yours at eminem-belly.vercel.app</div>
          <div style={{ display: "flex", color: ACCENT_SOFT }}>↗ share your taste</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
