import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}

export async function getOptionalSession() {
  return auth();
}

// Email allowlist for admin-only routes (segment editor, etc.).
// Override with comma-separated ADMIN_EMAILS env var if you want.
const DEFAULT_ADMINS = ["liamtarzy@gmail.com"];

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return DEFAULT_ADMINS;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect("/");
  return session!;
}

export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return !!email && adminEmails().includes(email);
}
