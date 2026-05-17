"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  endGame,
  pauseGame,
  resumeGame,
} from "@/app/(app)/games/[id]/actions";
import { createClient } from "@/lib/supabase/client";
import ChallengeSheet from "./ChallengeSheet";
import GameTimer from "./GameTimer";
import StationSheet from "./StationSheet";
import type { Challenge, Claim, Station } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
      Loading map…
    </div>
  ),
});

type Team = {
  id: string;
  name: string;
  color: string;
  chips: number;
};

type Props = {
  gameId: string;
  gameName: string;
  gameStatus: string;
  gameEndsAt: string | null;
  stations: Station[];
  teams: Team[];
  initialClaims: Claim[];
  initialChallenges: Challenge[];
  currentTeam: Team | null;
  maxClaimDelta: number;
  userEmail: string;
  isAdmin: boolean;
};

type ChallengeWithText = Challenge & {
  title?: string;
  description?: string;
};

export default function GameClient({
  gameId,
  gameName,
  gameStatus: initialGameStatus,
  gameEndsAt: initialGameEndsAt,
  stations,
  teams,
  initialClaims,
  initialChallenges,
  currentTeam: initialCurrentTeam,
  maxClaimDelta,
  userEmail,
  isAdmin,
}: Props) {
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [teamsState, setTeamsState] = useState<Team[]>(teams);
  const [challenges, setChallenges] =
    useState<ChallengeWithText[]>(initialChallenges);
  const [gameStatus, setGameStatus] = useState<string>(initialGameStatus);
  const [gameEndsAt, setGameEndsAt] = useState<string | null>(
    initialGameEndsAt,
  );
  const [adminPending, startAdminTransition] = useTransition();
  const [adminError, setAdminError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  );
  const [selectedChallengeId, setSelectedChallengeId] = useState<
    string | null
  >(null);

  const supabase = useMemo(() => createClient(), []);

  const claimsByStation = useMemo(() => {
    const m: Record<string, Claim> = {};
    for (const c of claims) m[c.station_id] = c;
    return m;
  }, [claims]);

  const teamsById = useMemo(() => {
    const m: Record<string, Team> = {};
    for (const t of teamsState) m[t.id] = t;
    return m;
  }, [teamsState]);

  const stationCountByTeam = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of claims) m[c.team_id] = (m[c.team_id] ?? 0) + 1;
    return m;
  }, [claims]);

  const currentTeam = initialCurrentTeam
    ? teamsById[initialCurrentTeam.id] ?? initialCurrentTeam
    : null;

  // Realtime: refetch claims + teams on any change to either table for this game.
  useEffect(() => {
    const channel = supabase
      .channel(`game:${gameId}`)
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
            .select("station_id, team_id, chip_count")
            .eq("game_id", gameId);
          if (data) setClaims(data as Claim[]);
        },
      )
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
          if (data) setTeamsState(data as Team[]);
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
            .select(
              "id, town, lat, lng, type, reward_min, reward_max, status, revealed_by_team_id, revealed_at, locked_until, lock_minutes, completed_by_team_id, completed_at, failed_team_ids, title, description, visible",
            )
            .eq("game_id", gameId);
          if (data) setChallenges(data as ChallengeWithText[]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const g = payload.new as unknown as {
            status: string;
            ends_at: string | null;
          };
          setGameStatus(g.status);
          setGameEndsAt(g.ends_at);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, gameId]);

  const stationsById = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations) m[s.id] = s;
    return m;
  }, [stations]);

  const selectedStation = selectedStationId
    ? stationsById[selectedStationId] ?? null
    : null;
  const selectedClaim = selectedStationId
    ? claimsByStation[selectedStationId] ?? null
    : null;
  const selectedOwner = selectedClaim
    ? teamsById[selectedClaim.team_id] ?? null
    : null;
  const selectedChallenge = selectedChallengeId
    ? challenges.find((c) => c.id === selectedChallengeId) ?? null
    : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView
        stations={stations}
        claimsByStation={claimsByStation}
        teamsById={teamsById}
        challenges={challenges}
        onSelectStation={(id) => {
          setSelectedChallengeId(null);
          setSelectedStationId(id);
        }}
        onSelectChallenge={(id) => {
          setSelectedStationId(null);
          setSelectedChallengeId(id);
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto rounded-lg border border-zinc-800 bg-zinc-950/85 px-3 py-2 text-xs text-zinc-300 backdrop-blur">
          {currentTeam ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: currentTeam.color }}
                aria-hidden
              />
              <span className="font-medium text-zinc-100">
                {currentTeam.name}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="tabular-nums text-zinc-100">
                {currentTeam.chips}
              </span>
              <span className="text-zinc-500">chips</span>
            </div>
          ) : (
            <div className="text-zinc-500">admin view</div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center text-xs text-zinc-500">
            <span>{gameName}</span>
            <span className="mx-1.5 text-zinc-700">·</span>
            <GameTimer status={gameStatus} endsAt={gameEndsAt} />
            <span className="mx-1.5 text-zinc-700">·</span>
            <Link
              href={`/games/${gameId}/join`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              lobby
            </Link>
            <span className="mx-1.5 text-zinc-700">·</span>
            <Link
              href={`/games/${gameId}/feed`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              feed
            </Link>
            <span className="mx-1.5 text-zinc-700">·</span>
            <Link
              href={`/games/${gameId}/scoreboard`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              scoreboard
            </Link>
            {isAdmin ? (
              <>
                <span className="mx-1.5 text-zinc-700">·</span>
                <Link
                  href={`/games/${gameId}/challenges`}
                  className="underline underline-offset-2 hover:text-zinc-200"
                >
                  challenges
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5 text-xs">
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/85 px-3 py-1.5 text-[11px] text-zinc-500 backdrop-blur">
            <span className="font-mono">{userEmail}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="underline underline-offset-2 hover:text-zinc-300"
              >
                sign out
              </button>
            </form>
          </div>
          {isAdmin && gameStatus !== "lobby" ? (
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/85 px-3 py-2 text-[11px] backdrop-blur">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                Admin
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {gameStatus === "active" ? (
                  <button
                    type="button"
                    disabled={adminPending}
                    onClick={() => {
                      setAdminError(null);
                      startAdminTransition(async () => {
                        const r = await pauseGame(gameId);
                        if (!r.ok) setAdminError(r.error);
                      });
                    }}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 hover:border-amber-500 hover:text-amber-300 disabled:opacity-50"
                  >
                    Pause
                  </button>
                ) : null}
                {gameStatus === "paused" ? (
                  <button
                    type="button"
                    disabled={adminPending}
                    onClick={() => {
                      setAdminError(null);
                      startAdminTransition(async () => {
                        const r = await resumeGame(gameId);
                        if (!r.ok) setAdminError(r.error);
                      });
                    }}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
                  >
                    Resume
                  </button>
                ) : null}
                {gameStatus !== "ended" ? (
                  <button
                    type="button"
                    disabled={adminPending}
                    onClick={() => {
                      if (
                        !confirm(
                          "End this game now? This cannot be undone.",
                        )
                      ) {
                        return;
                      }
                      setAdminError(null);
                      startAdminTransition(async () => {
                        const r = await endGame(gameId);
                        if (!r.ok) setAdminError(r.error);
                      });
                    }}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 hover:border-red-500 hover:text-red-300 disabled:opacity-50"
                  >
                    End
                  </button>
                ) : (
                  <span className="text-zinc-500">game ended</span>
                )}
              </div>
              {adminError ? (
                <p className="text-red-400">{adminError}</p>
              ) : null}
            </div>
          ) : null}
          {teamsState.length > 0 ? (
            <Link
              href={`/games/${gameId}/scoreboard`}
              className="block rounded-lg border border-zinc-800 bg-zinc-950/85 px-2 py-1.5 backdrop-blur hover:border-zinc-600"
            >
              <table className="text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
                    <th className="py-0.5 pr-4 text-left font-normal">Team</th>
                    <th className="px-2 py-0.5 text-right font-normal">
                      Chips
                    </th>
                    <th className="pl-2 py-0.5 text-right font-normal">Stns</th>
                  </tr>
                </thead>
                <tbody>
                  {teamsState.map((t) => {
                    const stns = stationCountByTeam[t.id] ?? 0;
                    return (
                      <tr key={t.id} className="tabular-nums">
                        <td className="py-0.5 pr-4 text-zinc-300">
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: t.color }}
                              aria-hidden
                            />
                            <span>{t.name}</span>
                          </span>
                        </td>
                        <td className="px-2 py-0.5 text-right text-zinc-100">
                          {t.chips}
                        </td>
                        <td className="pl-2 py-0.5 text-right text-zinc-100">
                          {stns}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Link>
          ) : null}
        </div>
      </div>

      {selectedStation ? (
        <StationSheet
          station={selectedStation}
          claim={selectedClaim}
          owner={selectedOwner}
          currentTeam={currentTeam}
          gameId={gameId}
          gameStatus={gameStatus}
          maxClaimDelta={maxClaimDelta}
          onClose={() => setSelectedStationId(null)}
        />
      ) : null}

      {selectedChallenge ? (
        <ChallengeSheet
          challenge={selectedChallenge}
          teams={teamsState}
          currentTeam={currentTeam}
          gameStatus={gameStatus}
          onClose={() => setSelectedChallengeId(null)}
        />
      ) : null}
    </div>
  );
}
