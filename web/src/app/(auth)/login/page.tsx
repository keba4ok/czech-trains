import { signInWithEmail } from "./actions";

type LoginSearchParams = Promise<{
  sent?: string;
  error?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-50">
      <h1 className="text-2xl font-semibold tracking-tight">
        Czech Rail Game
      </h1>

      {sent ? (
        <div className="max-w-xs rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-4 text-center text-sm">
          Magic link sent to{" "}
          <span className="font-mono text-zinc-200">{sent}</span>.<br />
          Check your inbox.
        </div>
      ) : (
        <form
          action={signInWithEmail}
          className="flex w-full max-w-xs flex-col gap-3"
        >
          <label
            htmlFor="email"
            className="text-xs uppercase tracking-wide text-zinc-400"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Send magic link
          </button>
          {error ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : null}
        </form>
      )}
    </main>
  );
}
