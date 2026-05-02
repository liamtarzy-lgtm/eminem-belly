import Image from "next/image";
import { auth, signOut } from "@/auth";

export async function HeaderUser() {
  const session = await auth();
  if (!session?.user) return null;
  const { name, image } = session.user;

  return (
    <div className="flex items-center gap-3">
      {image && (
        <Image
          src={image}
          alt={name ?? "user"}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
          unoptimized
        />
      )}
      <span className="hidden text-sm sm:inline">{name}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/sign-in" });
        }}
      >
        <button
          type="submit"
          className="text-xs text-(--muted) hover:text-(--accent-soft)"
        >
          sign out
        </button>
      </form>
    </div>
  );
}
