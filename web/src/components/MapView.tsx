"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
} from "react-leaflet";

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type Claim = {
  station_id: string;
  team_id: string;
  chip_count: number;
};

export type ChallengeType = "ordinary" | "multiplier" | "steal";

export type Challenge = {
  id: string;
  town: string;
  lat: number;
  lng: number;
  type: ChallengeType;
  reward_min: number;
  reward_max: number;
  status: "open" | "revealed" | "completed" | "failed" | "expired";
  revealed_by_team_id: string | null;
  completed_by_team_id: string | null;
  locked_until: string | null;
  lock_minutes: number | null;
  failed_team_ids: string[];
  visible: boolean;
};

export type Region = "czech" | "berlin";

type Props = {
  stations: Station[];
  claimsByStation?: Record<string, Claim>;
  teamsById?: Record<string, { color: string; name: string }>;
  challenges?: Challenge[];
  onSelectStation?: (stationId: string) => void;
  onSelectChallenge?: (challengeId: string) => void;
  region?: Region;
};

const REGION_VIEW: Record<
  Region,
  { center: [number, number]; zoom: number }
> = {
  czech: { center: [49.8, 15.5], zoom: 7 },
  berlin: { center: [52.52, 13.405], zoom: 11 },
};

const UNCLAIMED_STROKE = "#52525b";
const UNCLAIMED_FILL = "#e4e4e7";

const CHALLENGE_EMOJI: Record<ChallengeType, string> = {
  ordinary: "📍",
  steal: "⚡",
  multiplier: "⭐",
};

function challengeRingColor(
  challenge: Challenge,
  ownerColor: string | undefined,
): string {
  switch (challenge.status) {
    case "completed":
      return "#22c55e";
    case "revealed":
      return ownerColor ?? "#eab308";
    case "failed":
    case "expired":
      return "#ef4444";
    default:
      return "#eab308"; // open
  }
}

function challengeIcon(
  challenge: Challenge,
  ownerColor: string | undefined,
): L.DivIcon {
  const ring = challengeRingColor(challenge, ownerColor);
  const emoji = CHALLENGE_EMOJI[challenge.type];
  return L.divIcon({
    className: "challenge-marker",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:rgba(15,15,20,0.92);border:2px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 8px ${ring}80;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function MapView({
  stations,
  claimsByStation = {},
  teamsById = {},
  challenges = [],
  onSelectStation,
  onSelectChallenge,
  region = "czech",
}: Props) {
  const renderableChallenges = challenges.filter((c) => c.visible);
  const { center, zoom } = REGION_VIEW[region];
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      preferCanvas
      className="h-full w-full bg-zinc-950"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      {stations.map((s) => {
        const claim = claimsByStation[s.id];
        const team = claim ? teamsById[claim.team_id] : undefined;
        const fillColor = team?.color ?? UNCLAIMED_FILL;
        const strokeColor = team?.color ?? UNCLAIMED_STROKE;
        const radius = claim ? 6 : 4;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={radius}
            pathOptions={{
              color: strokeColor,
              fillColor,
              fillOpacity: claim ? 0.95 : 0.85,
              weight: claim ? 1.5 : 1,
            }}
            eventHandlers={
              onSelectStation
                ? { click: () => onSelectStation(s.id) }
                : undefined
            }
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              {s.name}
              {claim && team ? ` — ${team.name} (${claim.chip_count})` : ""}
            </Tooltip>
          </CircleMarker>
        );
      })}
      {renderableChallenges.map((c) => {
        const ownerColor = c.revealed_by_team_id
          ? teamsById[c.revealed_by_team_id]?.color
          : c.completed_by_team_id
            ? teamsById[c.completed_by_team_id]?.color
            : undefined;
        return (
          <Marker
            key={c.id}
            position={[c.lat, c.lng]}
            icon={challengeIcon(c, ownerColor)}
            eventHandlers={
              onSelectChallenge
                ? { click: () => onSelectChallenge(c.id) }
                : undefined
            }
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
              {c.town} — {c.type} ({c.status})
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
