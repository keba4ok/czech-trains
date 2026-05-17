// Default starting palette for the 3 auto-created teams. Players can rename
// and recolor (any hex) from the join page once they're on a team.
export const DEFAULT_TEAMS = [
  { name: "Red", color: "#ef4444" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Green", color: "#22c55e" },
] as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}
