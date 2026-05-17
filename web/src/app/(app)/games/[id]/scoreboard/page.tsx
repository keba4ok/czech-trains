import Link from "next/link";
import { redirect } from "next/navigation";
import ScoreboardClient from "@/components/ScoreboardClient";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export default async function ScoreboardPage({ params }: { params: Params }) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) redirect(`/games/${gameId}/join`);

  const [
    { data: teams },
    { data: claims },
    { data: completedChallenges },
    { data: stealEvents },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color, chips")
      .eq("game_id", gameId)
      .order("name"),
    supabase
      .from("station_claims")
      .select("team_id")
      .eq("game_id", gameId),
    supabase
      .from("challenges")
      .select("id, type, completed_by_team_id, reward_awarded")
      .eq("game_id", gameId)
      .eq("status", "completed"),
    supabase
      .from("events")
      .select("payload")
      .eq("game_id", gameId)
      .eq("type", "challenge_completed")
      .eq("payload->>challenge_type", "steal"),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-md flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Scoreboard — {game.status}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {game.name}
          </h1>
          <Link
            href={`/games/${gameId}`}
            className="shrink-0 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
          >
            ← map
          </Link>
        </div>
      </div>

      <div className="w-full max-w-md">
        <ScoreboardClient
          gameId={gameId}
          initialTeams={teams ?? []}
          initialClaims={(claims ?? []) as { team_id: string }[]}
          initialCompleted={
            (completedChallenges ?? []) as {
              id: string;
              type: "ordinary" | "multiplier" | "steal";
              completed_by_team_id: string | null;
              reward_awarded: number | null;
            }[]
          }
          initialStealEvents={
            (stealEvents ?? []) as {
              payload: {
                team_id?: string;
                target_team_id?: string | null;
                reward?: number;
              };
            }[]
          }
        />
      </div>
    </main>
  );
}
