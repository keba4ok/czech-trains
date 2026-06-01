import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { joinTeam, startGame, updateTeamAppearance } from "./actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function JoinGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin client to bypass RLS for the lobby read — the user might not be a
  // member yet.
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("id, name, status, created_by")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) notFound();

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, color")
    .eq("game_id", gameId)
    .order("name");

  const { data: members } = await admin
    .from("team_members")
    .select("team_id, user_id")
    .eq("game_id", gameId);

  // Every authenticated user has admin rights — no need to consult game_admins.
  const isAdmin = true;

  const memberCounts = (members ?? []).reduce<Record<string, number>>(
    (acc, m) => {
      acc[m.team_id] = (acc[m.team_id] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const currentTeamId = (members ?? []).find((m) => m.user_id === user.id)
    ?.team_id;
  const currentTeam = (teams ?? []).find((t) => t.id === currentTeamId);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-md flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Pick your team — {game.status}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{game.name}</h1>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        {(teams ?? []).map((t) => {
          const count = memberCounts[t.id] ?? 0;
          const isCurrent = currentTeamId === t.id;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-zinc-900 px-4 py-3"
              style={{
                borderColor: isCurrent ? t.color : "#27272a",
              }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="inline-block size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
                <span className="truncate text-base font-medium">
                  {t.name}
                </span>
                {isCurrent ? (
                  <span className="shrink-0 text-xs text-zinc-400">(you)</span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-zinc-500">
                  {count} member{count === 1 ? "" : "s"}
                </span>
                {isCurrent ? null : (
                  <form action={joinTeam}>
                    <input type="hidden" name="game_id" value={gameId} />
                    <input type="hidden" name="team_id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                    >
                      Join
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentTeam ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Customize your team
          </p>
          <form
            action={updateTeamAppearance}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm"
          >
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="team_id" value={currentTeam.id} />
            <input
              type="text"
              name="name"
              required
              maxLength={32}
              defaultValue={currentTeam.name}
              className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 focus:border-zinc-600 focus:outline-none"
            />
            <input
              type="color"
              name="color"
              defaultValue={currentTeam.color}
              className="h-8 w-10 cursor-pointer rounded border border-zinc-800 bg-zinc-950"
              aria-label={`${currentTeam.name} color`}
            />
            <button
              type="submit"
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Save
            </button>
          </form>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {currentTeamId || isAdmin ? (
        <Link
          href={`/games/${gameId}`}
          className="w-full max-w-md rounded-md bg-zinc-50 px-3 py-2 text-center text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Continue to map →
        </Link>
      ) : null}

      <div className="flex w-full max-w-md flex-col gap-2 text-xs text-zinc-400">
        <p>Share this link with friends so they can join:</p>
        <code className="block break-all rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono">
          /games/{gameId}/join
        </code>
      </div>

      {isAdmin ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Admin
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/games/${gameId}/challenges`}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            >
              Manage challenges
            </Link>
            {game.status === "lobby" ? (
              <form action={startGame}>
                <input type="hidden" name="game_id" value={gameId} />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                >
                  Start game
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
