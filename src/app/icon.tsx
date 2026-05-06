import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: -2,
        }}
      >
        E
        <span style={{ color: "#d70000", margin: "0 1px" }}>·</span>B
      </div>
    ),
    { ...size },
  );
}
