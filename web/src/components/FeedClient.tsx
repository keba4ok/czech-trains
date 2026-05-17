"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type FeedEvent = {
  id: string;
  type: string;
  payload: {
    station_id?: string;
    team_id?: string;
    user_id?: string;
    chips?: number;
    previous_team_id?: string | null;
    // challenge events
    challenge_id?: string;
    challenge_type?: "ordinary" | "multiplier" | "steal";
    reward?: number;
    target_team_id?: string | null;
    town?: string;
  };
  created_at: string;
};

type StationLookup = Record<string, { name: string }>;
type TeamLookup = Record<string, { name: string; color: string }>;

type Props = {
  gameId: string;
  initialEvents: FeedEvent[];
  stations: StationLookup;
  teams: TeamLookup;
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedClient({
  gameId,
  initialEvents,
  stations,
  teams: initialTeams,
}: Props) {
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [stationLookup, setStationLookup] =
    useState<StationLookup>(stations);
  const [teamLookup, setTeamLookup] = useState<TeamLookup>(initialTeams);
  const supabase = useMemo(() => createClient(), []);

  // Tick once a minute so relative timestamps refresh themselves.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`feed:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          const next = payload.new as unknown as FeedEvent;
          // If the event references a station we haven't seen, fetch its name
          // (cheap one-row select).
          const stationId = next.payload?.station_id;
          if (stationId && !stationLookup[stationId]) {
            const { data } = await supabase
              .from("stations")
              .select("id, name")
              .eq("id", stationId)
              .maybeSingle();
            if (data) {
              setStationLookup((prev) => ({
                ...prev,
                [data.id]: { name: data.name },
              }));
            }
          }
          setEvents((prev) => [next, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "teams",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const t = payload.new as unknown as {
            id: string;
            name: string;
            color: string;
          };
          setTeamLookup((prev) => ({
            ...prev,
            [t.id]: { name: t.name, color: t.color },
          }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, gameId, stationLookup]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing has happened yet — go claim a station.
      </p>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-2">
      {events.map((e) => {
        const team = e.payload.team_id ? teamLookup[e.payload.team_id] : null;
        const teamName = team?.name ?? "Someone";
        const teamColor = team?.color ?? "#e4e4e7";

        let body: React.ReactNode = null;

        if (
          e.type === "station_claim" ||
          e.type === "station_reinforce" ||
          e.type === "station_steal"
        ) {
          const station = e.payload.station_id
            ? stationLookup[e.payload.station_id]
            : null;
          const prevTeam = e.payload.previous_team_id
            ? teamLookup[e.payload.previous_team_id]
            : null;
          const chips = e.payload.chips ?? 0;
          const verb =
            e.type === "station_claim"
              ? "claimed"
              : e.type === "station_reinforce"
                ? "reinforced"
                : "stole";
          body = (
            <>
              <span style={{ color: teamColor }} className="font-medium">
                {teamName}
              </span>{" "}
              {verb}{" "}
              <span className="font-medium text-zinc-200">
                {station?.name ?? "a station"}
              </span>
              {prevTeam ? (
                <>
                  {" "}from{" "}
                  <span style={{ color: prevTeam.color }}>{prevTeam.name}</span>
                </>
              ) : null}{" "}
              with {chips} chip{chips === 1 ? "" : "s"}.
            </>
          );
        } else if (e.type === "challenge_revealed") {
          body = (
            <>
              <span style={{ color: teamColor }} className="font-medium">
                {teamName}
              </span>{" "}
              revealed{" "}
              <span className="text-zinc-300">
                {e.payload.challenge_type ?? "a"} challenge
              </span>{" "}
              in{" "}
              <span className="font-medium text-zinc-200">
                {e.payload.town ?? "town"}
              </span>
              .
            </>
          );
        } else if (e.type === "challenge_completed") {
          const ctype = e.payload.challenge_type;
          const reward = e.payload.reward ?? 0;
          const target = e.payload.target_team_id
            ? teamLookup[e.payload.target_team_id]
            : null;
          const ending: React.ReactNode =
            ctype === "ordinary" ? (
              <>
                {" "}— +{reward} chip{reward === 1 ? "" : "s"}.
              </>
            ) : ctype === "multiplier" ? (
              <>
                {" "}— gained {reward} chips from the multiplier.
              </>
            ) : ctype === "steal" && target ? (
              <>
                {" "}— stole {reward} chip{reward === 1 ? "" : "s"} from{" "}
                <span style={{ color: target.color }}>{target.name}</span>.
              </>
            ) : (
              <>.</>
            );
          body = (
            <>
              <span style={{ color: teamColor }} className="font-medium">
                {teamName}
              </span>{" "}
              completed the{" "}
              <span className="font-medium text-zinc-200">
                {e.payload.town ?? "town"}
              </span>{" "}
              challenge{ending}
            </>
          );
        } else if (e.type === "challenge_failed") {
          body = (
            <>
              <span style={{ color: teamColor }} className="font-medium">
                {teamName}
              </span>{" "}
              failed the{" "}
              <span className="font-medium text-zinc-200">
                {e.payload.town ?? "town"}
              </span>{" "}
              challenge — open to other teams.
            </>
          );
        } else if (e.type === "challenge_skipped") {
          // Legacy events from before the skip → fail change.
          body = (
            <>
              <span style={{ color: teamColor }} className="font-medium">
                {teamName}
              </span>{" "}
              skipped the{" "}
              <span className="font-medium text-zinc-200">
                {e.payload.town ?? "town"}
              </span>{" "}
              challenge.
            </>
          );
        } else {
          body = <span className="text-zinc-400">{e.type}</span>;
        }

        return (
          <li
            key={e.id}
            className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          >
            <span
              className="mt-1.5 inline-block size-2 shrink-0 rounded-full"
              style={{ backgroundColor: team?.color ?? "#71717a" }}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="leading-snug">{body}</p>
              <p className="text-xs text-zinc-500">{timeAgo(e.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
