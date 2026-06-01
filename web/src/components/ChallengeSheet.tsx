"use client";

import { useState, useTransition } from "react";
import {
  completeChallenge,
  failChallenge,
  revealChallenge,
} from "@/app/(app)/games/[id]/actions";
import type { Challenge, ChallengeType } from "./MapView";

type Team = {
  id: string;
  name: string;
  color: string;
  chips: number;
};

type Props = {
  challenge: Challenge & {
    title?: string;
    description?: string;
  };
  teams: Team[];
  currentTeam: Team | null;
  gameStatus: string;
  onClose: () => void;
};

function rewardSummary(c: Props["challenge"]): string {
  if (c.type === "ordinary") {
    return c.reward_min === c.reward_max
      ? `${c.reward_min} chips`
      : `${c.reward_min}–${c.reward_max} chips`;
  }
  if (c.type === "multiplier") {
    return `×${c.reward_min} team chips`;
  }
  return `${c.reward_min}% of a rival team's chips`;
}

function failBonusPct(c: Props["challenge"]): number {
  return (c.failed_team_ids ?? []).length * 25;
}

function lockTimeLeft(lockedUntil: string | null): string | null {
  if (!lockedUntil) return null;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ChallengeSheet({
  challenge,
  teams,
  currentTeam,
  gameStatus,
  onClose,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const revealer = teams.find((t) => t.id === challenge.revealed_by_team_id);
  const isMine =
    !!revealer && !!currentTeam && revealer.id === currentTeam.id;
  const isCompleted = challenge.status === "completed";
  const isOpen = challenge.status === "open";
  const isRevealed = challenge.status === "revealed";
  const myTeamFailed =
    !!currentTeam &&
    (challenge.failed_team_ids ?? []).includes(currentTeam.id);
  const failedTeams = (challenge.failed_team_ids ?? [])
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is Team => !!t);

  // Local state for completion choices.
  const isOrdinaryRange =
    challenge.type === "ordinary" &&
    challenge.reward_min !== challenge.reward_max;
  const [rewardChoice, setRewardChoice] = useState<number>(challenge.reward_max);
  const otherTeams = teams.filter((t) => t.id !== currentTeam?.id);
  const [targetTeamId, setTargetTeamId] = useState<string>(
    otherTeams[0]?.id ?? "",
  );

  const canReveal =
    isOpen &&
    gameStatus === "active" &&
    currentTeam !== null &&
    !myTeamFailed &&
    !isPending;
  const canActOnRevealed =
    isRevealed && isMine && gameStatus === "active" && !isPending;

  const lockMsg = lockTimeLeft(challenge.locked_until);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] border-t border-zinc-800 bg-zinc-950/95 px-6 pb-8 pt-4 text-zinc-50 backdrop-blur">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Challenge — {challenge.type}
            </p>
            <h2 className="truncate text-xl font-semibold">
              {challenge.town}
            </h2>
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

        <p className="text-sm text-zinc-400">
          Reward: <span className="text-zinc-200">{rewardSummary(challenge)}</span>
          {failBonusPct(challenge) > 0 && !isCompleted ? (
            <span className="ml-2 text-emerald-400">
              +{failBonusPct(challenge)}% fail bonus
            </span>
          ) : null}
        </p>

        {/* === Status-specific body === */}

        {isCompleted ? (
          <div className="rounded border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
            Completed
            {challenge.completed_by_team_id
              ? ` by ${teams.find((t) => t.id === challenge.completed_by_team_id)?.name ?? "a team"}`
              : ""}
            {challenge.completed_by_team_id ? ", " : ". "}
            reward: {challenge.reward_min === challenge.reward_max
              ? challenge.reward_min
              : `${challenge.reward_min}–${challenge.reward_max}`}{" "}
            ({challenge.type}).
          </div>
        ) : isRevealed ? (
          <>
            <div
              className="rounded border bg-zinc-900 px-3 py-2 text-sm"
              style={{
                borderColor: revealer?.color ?? "#3f3f46",
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-400">
                  Locked by{" "}
                  <span
                    style={{ color: revealer?.color ?? "#e4e4e7" }}
                    className="font-medium"
                  >
                    {revealer?.name ?? "a team"}
                  </span>
                </span>
                {lockMsg ? (
                  <span className="text-zinc-500">{lockMsg} left</span>
                ) : null}
              </div>
            </div>

            {isMine ? (
              <>
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm">
                  <p className="mb-1 font-medium text-zinc-100">
                    {challenge.title ?? "(missing title)"}
                  </p>
                  <p className="whitespace-pre-wrap text-zinc-300">
                    {challenge.description ?? "(missing description)"}
                  </p>
                </div>

                {isOrdinaryRange ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400" htmlFor="reward_choice">
                      Chips to claim ({challenge.reward_min}–
                      {challenge.reward_max})
                    </label>
                    <input
                      id="reward_choice"
                      type="number"
                      min={challenge.reward_min}
                      max={challenge.reward_max}
                      value={rewardChoice}
                      onChange={(e) =>
                        setRewardChoice(
                          Number.parseInt(e.target.value || "0", 10),
                        )
                      }
                      className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                ) : null}

                {challenge.type === "steal" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400" htmlFor="target_team">
                      Steal {challenge.reward_min}% from
                    </label>
                    <select
                      id="target_team"
                      value={targetTeamId}
                      onChange={(e) => setTargetTeamId(e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none"
                    >
                      {otherTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.chips} chips)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canActOnRevealed}
                    onClick={() =>
                      run(() =>
                        completeChallenge(challenge.id, {
                          rewardChoice: isOrdinaryRange ? rewardChoice : undefined,
                          targetTeamId:
                            challenge.type === "steal"
                              ? targetTeamId
                              : undefined,
                        }),
                      )
                    }
                    className="flex-1 rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={!canActOnRevealed}
                    onClick={() => run(() => failChallenge(challenge.id))}
                    className="rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-sm font-medium text-red-300 hover:border-red-500 hover:bg-red-900/40 disabled:opacity-50"
                  >
                    Fail
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500">
                Wait for the lock to expire (or for the team to skip) to
                attempt this one.
              </p>
            )}
          </>
        ) : (
          <>
            {failedTeams.length > 0 ? (
              <div className="rounded border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                Failed by{" "}
                {failedTeams.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 ? ", " : ""}
                    <span style={{ color: t.color }}>{t.name}</span>
                  </span>
                ))}
                . Open to the remaining teams.
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Title and description are hidden until a team reveals.
              </p>
            )}
            <button
              type="button"
              disabled={!canReveal}
              onClick={() => run(() => revealChallenge(challenge.id))}
              className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
            >
              {gameStatus !== "active"
                ? `Game is ${gameStatus}`
                : !currentTeam
                  ? "Join a team to reveal"
                  : myTeamFailed
                    ? "Your team already failed this"
                    : "Reveal challenge"}
            </button>
          </>
        )}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
