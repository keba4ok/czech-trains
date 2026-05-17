"use server";

import { redirect } from "next/navigation";
import { isValidHex } from "@/lib/games/team-defaults";
import { createClient } from "@/lib/supabase/server";

export async function joinTeam(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  const teamId = String(formData.get("team_id") ?? "");
  if (!gameId || !teamId) {
    redirect(`/games/${gameId}/join?error=missing-team`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Insert/upsert: lets the user switch teams while in lobby (PK on user_id,game_id).
  const { error } = await supabase
    .from("team_members")
    .upsert(
      { user_id: user.id, game_id: gameId, team_id: teamId },
      { onConflict: "user_id,game_id" },
    );
  if (error) {
    redirect(
      `/games/${gameId}/join?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Stay on the lobby so the user can see the change, edit their team's
  // color, or switch again. "Continue" button takes them to the map.
  redirect(`/games/${gameId}/join`);
}

export async function updateTeamAppearance(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  const teamId = String(formData.get("team_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  if (!gameId || !teamId) redirect("/");
  if (!name) {
    redirect(`/games/${gameId}/join?error=missing-name`);
  }
  if (!isValidHex(color)) {
    redirect(`/games/${gameId}/join?error=invalid-color`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS (migration 0004) enforces: must be a member of this team, or admin.
  // The unique (game_id, color) constraint enforces palette uniqueness.
  const { error } = await supabase
    .from("teams")
    .update({ name, color })
    .eq("id", teamId);
  if (error) {
    redirect(
      `/games/${gameId}/join?error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(`/games/${gameId}/join`);
}

export async function startGame(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  if (!gameId) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game, error: readError } = await supabase
    .from("games")
    .select("config")
    .eq("id", gameId)
    .maybeSingle();
  if (readError || !game) {
    redirect(
      `/games/${gameId}/join?error=${encodeURIComponent(readError?.message ?? "game not found")}`,
    );
  }

  const durationHours =
    (game.config as { duration_hours?: number } | null)?.duration_hours ?? 24;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);

  // RLS games_update allows admins only.
  const { error } = await supabase
    .from("games")
    .update({
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      paused_at: null,
    })
    .eq("id", gameId);
  if (error) {
    redirect(
      `/games/${gameId}/join?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Deal the opening hand of 6 visible challenges. Any explicitly-pre-visible
  // ones (from bulk import) don't count toward the deal — draw_random_challenges
  // only flips hidden ones.
  const { error: drawError } = await supabase.rpc("draw_random_challenges", {
    p_game_id: gameId,
    p_n: 6,
  });
  if (drawError) {
    redirect(
      `/games/${gameId}/join?error=${encodeURIComponent(drawError.message)}`,
    );
  }

  redirect(`/games/${gameId}`);
}
