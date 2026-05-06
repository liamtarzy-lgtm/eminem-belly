import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 100,
          fontWeight: 900,
          letterSpacing: -6,
        }}
      >
        E
        <span style={{ color: "#d70000", margin: "0 4px" }}>·</span>B
      </div>
    ),
    { ...size },
  );
}
