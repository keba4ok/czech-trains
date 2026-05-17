"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Team = {
  id: string;
  name: string;
  color: string;
  chips: number;
};

type ClaimRow = { team_id: string };

type CompletedChallenge = {
  id: string;
  type: "ordinary" | "multiplier" | "steal";
  completed_by_team_id: string | null;
  reward_awarded: number | null;
};

type StealEvent = {
  payload: {
    team_id?: string;
    target_team_id?: string | null;
    reward?: number;
  };
};

type Props = {
  gameId: string;
  initialTeams: Team[];
  initialClaims: ClaimRow[];
  initialCompleted: CompletedChallenge[];
  initialStealEvents: StealEvent[];
};

type TeamStats = {
  stationsOwned: number;
  challengesCompleted: number;
  chipsStolen: number;
  stealsDealt: number;
  chipsLostToSteals: number;
  stealsReceived: number;
};

function aggregate(
  teams: Team[],
  claims: ClaimRow[],
  completed: CompletedChallenge[],
  steals: StealEvent[],
): Record<string, TeamStats> {
  const stats: Record<string, TeamStats> = {};
  for (const t of teams) {
    stats[t.id] = {
      stationsOwned: 0,
      challengesCompleted: 0,
      chipsStolen: 0,
      stealsDealt: 0,
      chipsLostToSteals: 0,
      stealsReceived: 0,
    };
  }
  for (const c of claims) {
    const s = stats[c.team_id];
    if (s) s.stationsOwned += 1;
  }
  for (const ch of completed) {
    if (!ch.completed_by_team_id) continue;
    const s = stats[ch.completed_by_team_id];
    if (s) s.challengesCompleted += 1;
  }
  for (const e of steals) {
    const reward = e.payload.reward ?? 0;
    const stealer = e.payload.team_id;
    const target = e.payload.target_team_id ?? null;
    if (stealer && stats[stealer]) {
      stats[stealer].chipsStolen += reward;
      stats[stealer].stealsDealt += 1;
    }
    if (target && stats[target]) {
      stats[target].chipsLostToSteals += reward;
      stats[target].stealsReceived += 1;
    }
  }
  return stats;
}

export default function ScoreboardClient({
  gameId,
  initialTeams,
  initialClaims,
  initialCompleted,
  initialStealEvents,
}: Props) {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [claims, setClaims] = useState<ClaimRow[]>(initialClaims);
  const [completed, setCompleted] =
    useState<CompletedChallenge[]>(initialCompleted);
  const [steals, setSteals] = useState<StealEvent[]>(initialStealEvents);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`scoreboard:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teams",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          const { data } = await supabase
            .from("teams")
            .select("id, name, color, chips")
            .eq("game_id", gameId)
            .order("name");
          if (data) setTeams(data as Team[]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "station_claims",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          const { data } = await supabase
            .from("station_claims")
            .select("team_id")
            .eq("game_id", gameId);
          if (data) setClaims(data as ClaimRow[]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          const { data } = await supabase
            .from("challenges")
            .select("id, type, completed_by_team_id, reward_awarded")
            .eq("game_id", gameId)
            .eq("status", "completed");
          if (data) setCompleted(data as CompletedChallenge[]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const e = payload.new as unknown as {
            type: string;
            payload: StealEvent["payload"] & {
              challenge_type?: string;
            };
          };
          if (
            e.type === "challenge_completed" &&
            e.payload.challenge_type === "steal"
          ) {
            setSteals((prev) => [...prev, { payload: e.payload }]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, gameId]);

  const stats = useMemo(
    () => aggregate(teams, claims, completed, steals),
    [teams, claims, completed, steals],
  );

  const ordered = useMemo(
    () => [...teams].sort((a, b) => b.chips - a.chips),
    [teams],
  );

  if (teams.length === 0) {
    return <p className="text-sm text-zinc-500">No teams yet.</p>;
  }

  return (
    <ul className="flex w-full flex-col gap-3">
      {ordered.map((t) => {
        const s = stats[t.id];
        if (!s) return null;
        return (
          <li
            key={t.id}
            className="rounded-lg border bg-zinc-900 px-4 py-3"
            style={{ borderColor: t.color }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-block size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
                <span className="truncate text-base font-medium text-zinc-100">
                  {t.name}
                </span>
              </div>
              <span className="shrink-0 text-lg font-semibold tabular-nums text-zinc-50">
                {t.chips}{" "}
                <span className="text-xs font-normal text-zinc-500">chips</span>
              </span>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
              <div className="flex items-center justify-between">
                <dt>Stations</dt>
                <dd className="font-medium text-zinc-200 tabular-nums">
                  {s.stationsOwned}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Challenges done</dt>
                <dd className="font-medium text-zinc-200 tabular-nums">
                  {s.challengesCompleted}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Stolen (+)</dt>
                <dd className="font-medium text-emerald-300 tabular-nums">
                  +{s.chipsStolen}
                  {s.stealsDealt ? (
                    <span className="ml-1 text-[10px] text-zinc-500">
                      ({s.stealsDealt})
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Lost (−)</dt>
                <dd className="font-medium text-red-300 tabular-nums">
                  −{s.chipsLostToSteals}
                  {s.stealsReceived ? (
                    <span className="ml-1 text-[10px] text-zinc-500">
                      ({s.stealsReceived})
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
