import Link from "next/link";
import { redirect } from "next/navigation";
import RewardFields from "@/components/RewardFields";
import { createClient } from "@/lib/supabase/server";
import {
  bulkImportChallenges,
  createChallenge,
  deleteChallenge,
} from "./actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string; imported?: string }>;

const EXAMPLE_JSON = `[
  {
    "town": "Pardubice",
    "lat": 50.0379,
    "lng": 15.7794,
    "type": "ordinary",
    "reward": 50,
    "lock_minutes": 20,
    "title": "Fixed-reward example",
    "description": "lock_minutes is optional — omit it to use the game default."
  },
  {
    "town": "Olomouc",
    "lat": 49.5956,
    "lng": 17.2514,
    "type": "multiplier",
    "reward": 2,
    "visible": true,
    "title": "Always-visible example",
    "description": "visible:true opts this challenge out of the auto-draw deck — it shows on the map immediately."
  }
]`;

export default async function ChallengesAdminPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { error, imported } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin gate
  const { data: adminRow } = await supabase
    .from("game_admins")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) redirect(`/games/${gameId}`);

  const { data: game } = await supabase
    .from("games")
    .select("id, name, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) redirect("/");

  const { data: challenges } = await supabase
    .from("challenges")
    .select(
      "id, town, lat, lng, type, reward_min, reward_max, title, status, created_at",
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-2xl flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Challenges — admin
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {game.name}
          </h1>
          <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-400">
            <Link
              href={`/games/${gameId}/join`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              ← lobby
            </Link>
            <Link
              href={`/games/${gameId}`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              ← map
            </Link>
          </div>
        </div>
      </div>

      <form
        action={bulkImportChallenges}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="game_id" value={gameId} />
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Bulk import JSON
        </p>
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          required
          className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          className="self-start rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Import
        </button>
        {imported ? (
          <p className="text-xs text-emerald-400">
            Imported {imported} challenge{imported === "1" ? "" : "s"}.
          </p>
        ) : null}
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">
            Show expected JSON format
          </summary>
          <pre className="mt-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
            {EXAMPLE_JSON}
          </pre>
        </details>
      </form>

      <form
        action={createChallenge}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="game_id" value={gameId} />
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          New challenge
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="town">
            Town
          </label>
          <input
            id="town"
            name="town"
            required
            placeholder="Pardubice"
            className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-zinc-400" htmlFor="lat">
              Latitude
            </label>
            <input
              id="lat"
              name="lat"
              type="number"
              required
              step="any"
              min={-90}
              max={90}
              placeholder="50.0379"
              className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-zinc-400" htmlFor="lng">
              Longitude
            </label>
            <input
              id="lng"
              name="lng"
              type="number"
              required
              step="any"
              min={-180}
              max={180}
              placeholder="15.7794"
              className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>

        <RewardFields initialType="ordinary" initialMin={50} initialMax={50} />

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="lock_minutes">
            Lock timer (minutes, optional)
          </label>
          <input
            id="lock_minutes"
            name="lock_minutes"
            type="number"
            min={1}
            placeholder="uses game default if blank"
            className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="title">
            Title (hidden until revealed)
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            placeholder="Find the bronze train statue"
            className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="description">
            Description (hidden until revealed)
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={3}
            placeholder="The statue is somewhere on the platform side of the station…"
            className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="self-start rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Create challenge
        </button>

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </form>

      <div className="flex w-full max-w-2xl flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          {(challenges ?? []).length} challenge
          {(challenges ?? []).length === 1 ? "" : "s"}
        </p>
        {(challenges ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">
            None yet. Seed them in here before starting the game.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(challenges ?? []).map((c) => {
              const rewardLabel =
                c.reward_min === c.reward_max
                  ? `${c.reward_min}`
                  : `${c.reward_min}–${c.reward_max}`;
              return (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.town}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400">{c.type}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400">{rewardLabel}</span>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {c.title} · {c.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/games/${gameId}/challenges/${c.id}`}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800"
                    >
                      open
                    </Link>
                    <form action={deleteChallenge}>
                      <input type="hidden" name="game_id" value={gameId} />
                      <input type="hidden" name="challenge_id" value={c.id} />
                      <button
                        type="submit"
                        className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 hover:border-red-500/50 hover:text-red-400"
                      >
                        delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
