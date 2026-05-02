import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const callbackUrl = from && from.startsWith("/") ? from : "/";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Eminem<span className="text-(--accent)"> · </span>Belly
        </h1>
        <p className="mt-3 text-(--muted)">
          Rank Em&apos;s catalog. Sign in to keep your list.
        </p>
      </div>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
        className="w-full"
      >
        <button
          type="submit"
          className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 font-medium hover:border-(--accent) hover:bg-(--surface-2)"
        >
          Continue with Google
        </button>
      </form>

      <p className="text-center text-xs text-(--muted)">
        We only use your account to identify you and remember your rankings.
      </p>
    </div>
  );
}
