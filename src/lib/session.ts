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
