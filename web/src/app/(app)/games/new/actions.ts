"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  defaultTeamsFor,
  MAX_TEAMS,
  MIN_TEAMS,
} from "@/lib/games/team-defaults";

const VALID_REGIONS = new Set(["czech", "berlin"] as const);
type Region = "czech" | "berlin";

export async function createGame(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/games/new?error=missing-name");
  }

  const rawRegion = String(formData.get("region") ?? "").trim();
  if (!VALID_REGIONS.has(rawRegion as Region)) {
    redirect("/games/new?error=invalid-region");
  }
  const region = rawRegion as Region;

  const rawTeamCount = String(formData.get("team_count") ?? "").trim();
  const teamCount = Number.parseInt(rawTeamCount, 10);
  if (
    !Number.isInteger(teamCount) ||
    teamCount < MIN_TEAMS ||
    teamCount > MAX_TEAMS
  ) {
    redirect("/games/new?error=invalid-team-count");
  }

  const rawDuration = String(formData.get("duration_hours") ?? "").trim();
  const duration = rawDuration === "" ? 24 : Number.parseFloat(rawDuration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 720) {
    redirect("/games/new?error=invalid-duration");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Game row — RLS policy allows insert when created_by = auth.uid().
  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      name,
      created_by: user.id,
      config: {
        starting_chips: 20,
        max_claim_delta: 4,
        challenge_lock_minutes: 30,
        duration_hours: duration,
        region,
      },
    })
    .select("id, config")
    .single();
  if (gameError || !game) {
    redirect(
      `/games/new?error=${encodeURIComponent(gameError?.message ?? "create failed")}`,
    );
  }

  // 2. Bootstrap creator as admin — RLS policy allows insert because the
  // user just created the game.
  const { error: adminError } = await supabase
    .from("game_admins")
    .insert({ game_id: game.id, user_id: user.id });
  if (adminError) {
    redirect(
      `/games/new?error=${encodeURIComponent(adminError.message)}`,
    );
  }

  // 3. Seed the chosen number of teams — RLS policy allows insert because
  // the user is now admin.
  const startingChips =
    ((game.config as { starting_chips?: number } | null)?.starting_chips ??
      10);
  const { error: teamsError } = await supabase.from("teams").insert(
    defaultTeamsFor(teamCount).map((t) => ({
      game_id: game.id,
      name: t.name,
      color: t.color,
      chips: startingChips,
    })),
  );
  if (teamsError) {
    redirect(
      `/games/new?error=${encodeURIComponent(teamsError.message)}`,
    );
  }

  redirect(`/games/${game.id}/join`);
}
