import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { HeaderUser } from "./_components/HeaderUser";
import { HeaderNav } from "./_components/HeaderNav";
import { NowPlaying } from "./_components/NowPlaying";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Eminem Belly — rank Em's catalog",
  description: "Rank Eminem's discography by pairwise comparison.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-(--border) bg-(--background)/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <Link
              href="/"
              className="font-bold tracking-tight text-base sm:text-lg shrink-0"
            >
              Eminem<span className="text-(--accent)"> · </span>Belly
            </Link>
            <HeaderNav />
            <HeaderUser />
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <NowPlaying />
      </body>
    </html>
  );
}
