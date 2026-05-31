import { notFound, redirect } from "next/navigation";
import GameClient from "@/components/GameClient";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export default async function GamePage({ params }: { params: Params }) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, status, config, created_by, starts_at, ends_at, paused_at")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) {
    // Either truly missing or RLS-hidden — bounce to join page.
    redirect(`/games/${gameId}/join`);
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: adminRow } = await supabase
    .from("game_admins")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = adminRow !== null;
  if (!membership && !isAdmin) redirect(`/games/${gameId}/join`);

  const config = game.config as {
    max_claim_delta?: number;
    region?: "czech" | "berlin";
  } | null;
  const region: "czech" | "berlin" = config?.region ?? "czech";

  const [
    { data: teams },
    { data: claims },
    { data: stations },
    { data: challenges },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color, chips")
      .eq("game_id", gameId)
      .order("name"),
    supabase
      .from("station_claims")
      .select("station_id, team_id, chip_count")
      .eq("game_id", gameId),
    supabase
      .from("stations")
      .select("id, name, lat, lng")
      .eq("playable", true)
      .eq("region", region)
      .limit(5000),
    supabase
      .from("challenges")
      .select(
        "id, town, lat, lng, type, reward_min, reward_max, status, revealed_by_team_id, revealed_at, locked_until, lock_minutes, completed_by_team_id, completed_at, failed_team_ids, title, description, visible",
      )
      .eq("game_id", gameId),
  ]);

  if (!stations) notFound();

  const currentTeam =
    teams?.find((t) => t.id === membership?.team_id) ?? null;
  const maxClaimDelta = config?.max_claim_delta ?? 4;

  return (
    <GameClient
      gameId={gameId}
      gameName={game.name}
      gameStatus={game.status}
      gameEndsAt={game.ends_at}
      stations={stations}
      teams={teams ?? []}
      initialClaims={claims ?? []}
      initialChallenges={challenges ?? []}
      currentTeam={currentTeam}
      maxClaimDelta={maxClaimDelta}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
      region={region}
    />
  );
}
