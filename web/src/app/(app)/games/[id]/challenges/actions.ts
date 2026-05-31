"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES = ["ordinary", "steal", "multiplier"] as const;
type ChallengeType = (typeof VALID_TYPES)[number];

function fail(gameId: string, msg: string): never {
  redirect(`/games/${gameId}/challenges?error=${encodeURIComponent(msg)}`);
}

function parseOptionalPositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function parseReward(raw: string, allowFractional: boolean): number {
  const trimmed = raw.trim();
  if (trimmed === "") return NaN;
  const n = allowFractional
    ? Number.parseFloat(trimmed)
    : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (!allowFractional && !Number.isInteger(n)) return NaN;
  return n;
}

export async function createChallenge(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  if (!gameId) redirect("/");

  const town = String(formData.get("town") ?? "").trim();
  const lat = Number.parseFloat(String(formData.get("lat") ?? ""));
  const lng = Number.parseFloat(String(formData.get("lng") ?? ""));
  const type = String(formData.get("type") ?? "");
  const allowFractional = type === "multiplier";
  const rewardMin = parseReward(
    String(formData.get("reward_min") ?? ""),
    allowFractional,
  );
  const rewardMax = parseReward(
    String(formData.get("reward_max") ?? ""),
    allowFractional,
  );
  const lockMinutes = parseOptionalPositiveInt(
    String(formData.get("lock_minutes") ?? ""),
  );
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!town) fail(gameId, "town required");
  if (!title) fail(gameId, "title required");
  if (!description) fail(gameId, "description required");
  if (Number.isNaN(lat) || lat < -90 || lat > 90)
    fail(gameId, "invalid lat");
  if (Number.isNaN(lng) || lng < -180 || lng > 180)
    fail(gameId, "invalid lng");
  if (!VALID_TYPES.includes(type as ChallengeType))
    fail(gameId, "invalid type");
  if (Number.isNaN(rewardMin)) fail(gameId, "invalid reward_min");
  if (Number.isNaN(rewardMax) || rewardMax < rewardMin)
    fail(gameId, "reward_max must be >= reward_min");
  if (Number.isNaN(lockMinutes as number))
    fail(gameId, "lock_minutes must be a positive integer or empty");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS: challenges_insert requires admin of this game.
  const { error } = await supabase.from("challenges").insert({
    game_id: gameId,
    town,
    lat,
    lng,
    type,
    reward_min: rewardMin,
    reward_max: rewardMax,
    lock_minutes: lockMinutes,
    title,
    description,
    created_by: user.id,
  });
  if (error) fail(gameId, error.message);

  redirect(`/games/${gameId}/challenges`);
}

type RawChallenge = {
  town?: unknown;
  lat?: unknown;
  lng?: unknown;
  type?: unknown;
  reward?: unknown;
  reward_min?: unknown;
  reward_max?: unknown;
  lock_minutes?: unknown;
  title?: unknown;
  description?: unknown;
  visible?: unknown;
};

export async function bulkImportChallenges(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  if (!gameId) redirect("/");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fail(gameId, "no file uploaded");
  }

  let text: string;
  try {
    text = await (file as File).text();
  } catch {
    fail(gameId, "could not read file");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    fail(gameId, `invalid JSON: ${(e as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    fail(gameId, "expected a JSON array of challenges");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < parsed.length; i++) {
    const c = parsed[i] as RawChallenge;
    if (typeof c !== "object" || c === null) {
      fail(gameId, `entry ${i}: not an object`);
    }
    if (typeof c.town !== "string" || !c.town.trim())
      fail(gameId, `entry ${i}: town required`);
    if (typeof c.title !== "string" || !c.title.trim())
      fail(gameId, `entry ${i}: title required`);
    if (typeof c.description !== "string" || !c.description.trim())
      fail(gameId, `entry ${i}: description required`);
    if (
      typeof c.lat !== "number" ||
      Number.isNaN(c.lat) ||
      c.lat < -90 ||
      c.lat > 90
    )
      fail(gameId, `entry ${i}: invalid lat`);
    if (
      typeof c.lng !== "number" ||
      Number.isNaN(c.lng) ||
      c.lng < -180 ||
      c.lng > 180
    )
      fail(gameId, `entry ${i}: invalid lng`);
    if (!VALID_TYPES.includes(c.type as ChallengeType))
      fail(gameId, `entry ${i}: invalid type`);

    // Reward can be given as a single fixed value (`reward`) or as a range
    // (`reward_min` / `reward_max`). Multipliers accept fractional
    // coefficients (1.2×, 1.7×, …); ordinary and steal stay integer.
    const allowFractional = c.type === "multiplier";
    const isValidReward = (n: unknown): n is number =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      n >= 0 &&
      (allowFractional || Number.isInteger(n));
    let rewardMin: number;
    let rewardMax: number;
    if (typeof c.reward === "number") {
      if (!isValidReward(c.reward))
        fail(gameId, `entry ${i}: invalid reward`);
      rewardMin = c.reward;
      rewardMax = c.reward;
    } else {
      if (!isValidReward(c.reward_min))
        fail(gameId, `entry ${i}: invalid reward_min`);
      rewardMin = c.reward_min as number;
      if (!isValidReward(c.reward_max) || (c.reward_max as number) < rewardMin)
        fail(gameId, `entry ${i}: reward_max must be >= reward_min`);
      rewardMax = c.reward_max as number;
    }

    let lockMinutes: number | null = null;
    if (c.lock_minutes !== undefined && c.lock_minutes !== null) {
      if (
        typeof c.lock_minutes !== "number" ||
        !Number.isInteger(c.lock_minutes) ||
        c.lock_minutes <= 0
      )
        fail(gameId, `entry ${i}: lock_minutes must be a positive integer`);
      lockMinutes = c.lock_minutes;
    }

    let visible = false;
    if (c.visible !== undefined && c.visible !== null) {
      if (typeof c.visible !== "boolean")
        fail(gameId, `entry ${i}: visible must be a boolean`);
      visible = c.visible;
    }

    rows.push({
      game_id: gameId,
      town: (c.town as string).trim(),
      lat: c.lat,
      lng: c.lng,
      type: c.type,
      reward_min: rewardMin,
      reward_max: rewardMax,
      lock_minutes: lockMinutes,
      title: (c.title as string).trim(),
      description: (c.description as string).trim(),
      visible,
      created_by: user.id,
    });
  }

  if (rows.length === 0) {
    fail(gameId, "no challenges in file");
  }

  const { error } = await supabase.from("challenges").insert(rows);
  if (error) fail(gameId, error.message);

  redirect(`/games/${gameId}/challenges?imported=${rows.length}`);
}

export async function updateChallenge(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  const challengeId = String(formData.get("challenge_id") ?? "");
  if (!gameId || !challengeId) redirect("/");

  const town = String(formData.get("town") ?? "").trim();
  const lat = Number.parseFloat(String(formData.get("lat") ?? ""));
  const lng = Number.parseFloat(String(formData.get("lng") ?? ""));
  const type = String(formData.get("type") ?? "");
  const allowFractional = type === "multiplier";
  const rewardMin = parseReward(
    String(formData.get("reward_min") ?? ""),
    allowFractional,
  );
  const rewardMax = parseReward(
    String(formData.get("reward_max") ?? ""),
    allowFractional,
  );
  const lockMinutes = parseOptionalPositiveInt(
    String(formData.get("lock_minutes") ?? ""),
  );
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const failHere = (msg: string): never =>
    redirect(
      `/games/${gameId}/challenges/${challengeId}?error=${encodeURIComponent(msg)}`,
    );

  if (!town) failHere("town required");
  if (!title) failHere("title required");
  if (!description) failHere("description required");
  if (Number.isNaN(lat) || lat < -90 || lat > 90) failHere("invalid lat");
  if (Number.isNaN(lng) || lng < -180 || lng > 180) failHere("invalid lng");
  if (!VALID_TYPES.includes(type as ChallengeType)) failHere("invalid type");
  if (Number.isNaN(rewardMin)) failHere("invalid reward_min");
  if (Number.isNaN(rewardMax) || rewardMax < rewardMin)
    failHere("reward_max must be >= reward_min");
  if (Number.isNaN(lockMinutes as number))
    failHere("lock_minutes must be a positive integer or empty");

  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .update({
      town,
      lat,
      lng,
      type,
      reward_min: rewardMin,
      reward_max: rewardMax,
      lock_minutes: lockMinutes,
      title,
      description,
    })
    .eq("id", challengeId);
  if (error) failHere(error.message);

  redirect(`/games/${gameId}/challenges/${challengeId}?saved=1`);
}

export async function deleteChallenge(formData: FormData) {
  const gameId = String(formData.get("game_id") ?? "");
  const challengeId = String(formData.get("challenge_id") ?? "");
  if (!gameId || !challengeId) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .delete()
    .eq("id", challengeId);
  if (error) fail(gameId, error.message);

  redirect(`/games/${gameId}/challenges`);
}
