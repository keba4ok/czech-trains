import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Games where the user is on a team
  const { data: memberships } = await supabase
    .from("team_members")
    .select("game_id, games(id, name, status, created_at)")
    .order("joined_at", { ascending: false });

  type GameRow = {
    id: string;
    name: string;
    status: string;
    created_at: string;
  };
  const playerGames = (memberships ?? [])
    .map((m) => m.games as unknown as GameRow | null)
    .filter((g): g is GameRow => g !== null);

  // Games where the user is an admin (may also be a player)
  const { data: adminships } = await supabase
    .from("game_admins")
    .select("game_id, games(id, name, status, created_at)");

  const adminGames = (adminships ?? [])
    .map((a) => a.games as unknown as GameRow | null)
    .filter((g): g is GameRow => g !== null);

  // Union by id
  const allGames = new Map<string, GameRow>();
  [...playerGames, ...adminGames].forEach((g) => allGames.set(g.id, g));
  const games = Array.from(allGames.values());

  if (games.length === 1) {
    redirect(`/games/${games[0].id}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-50">
      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Czech Rail Game
        </h1>

        {games.length === 0 ? (
          <p className="text-sm text-zinc-400">
            You&apos;re not in any games yet. Start a new one, or paste a join
            link a friend sent you.
          </p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Your games
            </p>
            <ul className="flex flex-col gap-2">
              {games.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/games/${g.id}`}
                    className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-600 hover:bg-zinc-800"
                  >
                    <span>{g.name}</span>
                    <span className="text-xs text-zinc-500">{g.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <Link
          href="/games/new"
          className="rounded-md bg-zinc-50 px-3 py-2 text-center text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Create a new game
        </Link>

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-zinc-500">
          <span>
            Signed in as{" "}
            <span className="font-mono">
              {(user.user_metadata?.display_name as string | undefined) ??
                "anonymous"}
            </span>
          </span>
          <span aria-hidden>·</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
