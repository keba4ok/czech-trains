// Default starting palette for the auto-created teams. Players can rename
// and recolor (any hex) from the join page once they're on a team.
export const DEFAULT_TEAMS = [
  { name: "Red", color: "#ef4444" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Green", color: "#22c55e" },
  { name: "Yellow", color: "#eab308" },
] as const;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;

export function defaultTeamsFor(
  n: number,
): ReadonlyArray<(typeof DEFAULT_TEAMS)[number]> {
  const clamped = Math.min(Math.max(n, MIN_TEAMS), MAX_TEAMS);
  return DEFAULT_TEAMS.slice(0, clamped);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}
