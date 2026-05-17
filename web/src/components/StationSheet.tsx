"use client";

import { useState, useTransition } from "react";
import { claimStation } from "@/app/(app)/games/[id]/actions";

type Station = { id: string; name: string };
type Claim = { team_id: string; chip_count: number };
type Team = { id: string; name: string; color: string; chips?: number };

type Props = {
  station: Station;
  claim: Claim | null;
  owner: Team | null;
  currentTeam: Team | null;
  gameId: string;
  gameStatus: string;
  maxClaimDelta: number;
  onClose: () => void;
};

export default function StationSheet({
  station,
  claim,
  owner,
  currentTeam,
  gameId,
  gameStatus,
  maxClaimDelta,
  onClose,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canClaim = gameStatus === "active" && currentTeam !== null;
  const currentChips = claim?.chip_count ?? 0;
  const minChips = currentChips + 1;
  const teamChips = currentTeam?.chips ?? 0;
  const affordableMax = Math.min(currentChips + maxClaimDelta, teamChips);
  const chipOptions: number[] = [];
  for (let n = minChips; n <= affordableMax; n++) chipOptions.push(n);

  const isOwnedByMyTeam =
    owner && currentTeam && owner.id === currentTeam.id;
  const actionLabel = !claim
    ? "Claim"
    : isOwnedByMyTeam
      ? "Reinforce"
      : "Steal";

  const place = (chips: number) => {
    setError(null);
    startTransition(async () => {
      const result = await claimStation(gameId, station.id, chips);
      if (!result.ok) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] border-t border-zinc-800 bg-zinc-950/95 px-6 pb-8 pt-4 text-zinc-50 backdrop-blur">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Station
            </p>
            <h2 className="truncate text-xl font-semibold">{station.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close"
          >
            close
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {owner && claim ? (
            <>
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: owner.color }}
                aria-hidden
              />
              <span>{owner.name}</span>
              <span className="text-zinc-600">·</span>
              <span>
                {claim.chip_count} chip{claim.chip_count === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <span className="text-zinc-500">Unclaimed</span>
          )}
        </div>

        {!canClaim ? (
          <p className="text-xs text-zinc-500">
            {gameStatus !== "active"
              ? `Game is ${gameStatus} — no claims yet.`
              : "Join a team to claim stations."}
          </p>
        ) : chipOptions.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Need {minChips} chip{minChips === 1 ? "" : "s"} to beat current — your
            team has {teamChips}.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-zinc-400">
              {actionLabel} — place {minChips}
              {chipOptions.length > 1 ? `–${affordableMax}` : ""} chip
              {affordableMax === 1 && chipOptions.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              {chipOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={isPending}
                  onClick={() => place(n)}
                  className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
                >
                  {n} chip{n === 1 ? "" : "s"}
                </button>
              ))}
            </div>
          </div>
        )}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
