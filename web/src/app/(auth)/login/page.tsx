import { signInWithName } from "./actions";

type LoginSearchParams = Promise<{
  error?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-50">
      <h1 className="text-2xl font-semibold tracking-tight">
        Czech Rail Game
      </h1>

      <form
        action={signInWithName}
        className="flex w-full max-w-xs flex-col gap-3"
      >
        <label
          htmlFor="name"
          className="text-xs uppercase tracking-wide text-zinc-400"
        >
          Your name
        </label>
        <input
          id="name"
          type="text"
          name="name"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="e.g. Ivan"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Enter
        </button>
        <p className="text-xs text-zinc-500">
          No password — your session stays in this browser. Open the same
          URL in a different browser and you&apos;ll be a fresh player.
        </p>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </form>
    </main>
  );
}
