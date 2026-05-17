import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RewardFields from "@/components/RewardFields";
import { createClient } from "@/lib/supabase/server";
import { deleteChallenge, updateChallenge } from "../actions";

type Params = Promise<{ id: string; challengeId: string }>;
type SearchParams = Promise<{ error?: string; saved?: string }>;

export default async function ChallengeDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId, challengeId } = await params;
  const { error, saved } = await searchParams;

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

  const { data: challenge } = await supabase
    .from("challenges")
    .select(
      "id, game_id, town, lat, lng, type, reward_min, reward_max, lock_minutes, title, description, status, revealed_by_team_id, revealed_at, locked_until, completed_by_team_id, completed_at, reward_awarded, created_at",
    )
    .eq("id", challengeId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (!challenge) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-2xl flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Challenge
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {challenge.town} · {challenge.title}
          </h1>
          <Link
            href={`/games/${gameId}/challenges`}
            className="shrink-0 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
          >
            ← all challenges
          </Link>
        </div>
        <p className="text-xs text-zinc-500">
          {challenge.type} · {challenge.reward_min}
          {challenge.reward_max !== challenge.reward_min
            ? `–${challenge.reward_max}`
            : ""}{" "}
          · status {challenge.status}
        </p>
      </div>

      <form
        action={updateChallenge}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="challenge_id" value={challengeId} />
        <p className="text-xs uppercase tracking-wide text-zinc-500">Edit</p>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="town">
            Town
          </label>
          <input
            id="town"
            name="town"
            required
            defaultValue={challenge.town}
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
              defaultValue={challenge.lat}
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
              defaultValue={challenge.lng}
              className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>

        <RewardFields
          initialType={challenge.type as "ordinary" | "multiplier" | "steal"}
          initialMin={challenge.reward_min}
          initialMax={challenge.reward_max}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="lock_minutes">
            Lock timer (minutes, optional)
          </label>
          <input
            id="lock_minutes"
            name="lock_minutes"
            type="number"
            min={1}
            defaultValue={challenge.lock_minutes ?? ""}
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
            defaultValue={challenge.title}
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
            rows={5}
            defaultValue={challenge.description}
            className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Save changes
          </button>
          {saved ? (
            <span className="text-xs text-emerald-400">Saved.</span>
          ) : null}
          {error ? <span className="text-xs text-red-400">{error}</span> : null}
        </div>
      </form>

      <form action={deleteChallenge} className="w-full max-w-2xl">
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="challenge_id" value={challengeId} />
        <button
          type="submit"
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-500/50 hover:text-red-400"
        >
          Delete challenge
        </button>
      </form>
    </main>
  );
}
