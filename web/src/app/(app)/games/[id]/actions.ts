"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function claimStation(
  gameId: string,
  stationId: string,
  chips: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_station", {
    p_game_id: gameId,
    p_station_id: stationId,
    p_chips_placed: chips,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revealChallenge(
  challengeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reveal_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function completeChallenge(
  challengeId: string,
  options: {
    rewardChoice?: number;
    targetTeamId?: string;
  } = {},
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_challenge", {
    p_challenge_id: challengeId,
    p_reward_choice: options.rewardChoice ?? null,
    p_target_team_id: options.targetTeamId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function failChallenge(
  challengeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fail_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pauseGame(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // RLS games_update allows admins only.
  const { error } = await supabase
    .from("games")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resumeGame(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: game, error: readError } = await supabase
    .from("games")
    .select("status, ends_at, paused_at")
    .eq("id", gameId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!game) return { ok: false, error: "game not found" };
  if (game.status !== "paused") {
    return { ok: false, error: "game is not paused" };
  }

  // Shift ends_at forward by the duration of the pause so the countdown
  // continues from where it left off.
  let endsAt: string | null = game.ends_at;
  if (game.paused_at && game.ends_at) {
    const pausedFor =
      Date.now() - new Date(game.paused_at as string).getTime();
    const adjusted =
      new Date(game.ends_at as string).getTime() + Math.max(0, pausedFor);
    endsAt = new Date(adjusted).toISOString();
  }

  const { error } = await supabase
    .from("games")
    .update({ status: "active", paused_at: null, ends_at: endsAt })
    .eq("id", gameId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function endGame(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("games")
    .update({
      status: "ended",
      ends_at: new Date().toISOString(),
      paused_at: null,
    })
    .eq("id", gameId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
