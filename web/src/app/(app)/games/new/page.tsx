import { createGame } from "./actions";

type SearchParams = Promise<{ error?: string }>;

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create a game
        </h1>
        <p className="text-xs text-zinc-400">
          You become the game master. Pick a region, pick how many teams, and
          friends join via a link you share.
        </p>

        <form action={createGame} className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Region
          </span>
          <div className="grid grid-cols-2 gap-2">
            <label className="group cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 p-3 text-left transition hover:border-zinc-600 has-[input:checked]:border-zinc-50 has-[input:checked]:bg-zinc-800">
              <input
                type="radio"
                name="region"
                value="czech"
                required
                className="peer sr-only"
              />
              <span className="block text-sm font-medium text-zinc-100">
                Czech Republic
              </span>
              <span className="block text-[11px] text-zinc-500">
                1208 OSM stations
              </span>
            </label>
            <label className="group cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 p-3 text-left transition hover:border-zinc-600 has-[input:checked]:border-zinc-50 has-[input:checked]:bg-zinc-800">
              <input
                type="radio"
                name="region"
                value="berlin"
                required
                className="peer sr-only"
              />
              <span className="block text-sm font-medium text-zinc-100">
                Berlin
              </span>
              <span className="block text-[11px] text-zinc-500">
                U-Bahn + S-Bahn
              </span>
            </label>
          </div>

          <label
            htmlFor="name"
            className="text-xs uppercase tracking-wide text-zinc-400"
          >
            Game name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="Friday Rail Run"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none"
          />

          <label
            htmlFor="team_count"
            className="text-xs uppercase tracking-wide text-zinc-400"
          >
            Number of teams
          </label>
          <select
            id="team_count"
            name="team_count"
            defaultValue={3}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none"
          >
            <option value={2}>2 teams (Red, Blue)</option>
            <option value={3}>3 teams (Red, Blue, Green)</option>
            <option value={4}>4 teams (Red, Blue, Green, Yellow)</option>
          </select>

          <label
            htmlFor="duration_hours"
            className="text-xs uppercase tracking-wide text-zinc-400"
          >
            Duration (hours)
          </label>
          <input
            id="duration_hours"
            name="duration_hours"
            type="number"
            min={0.5}
            max={720}
            step="0.5"
            defaultValue={24}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none"
          />

          <button
            type="submit"
            className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Create game
          </button>
          {error ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
