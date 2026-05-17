"use client";

import { useEffect, useState } from "react";

type Props = {
  status: string;
  endsAt: string | null;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export default function GameTimer({ status, endsAt }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (status !== "active" || !endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status, endsAt]);

  if (status === "lobby") return <span className="text-zinc-500">lobby</span>;
  if (status === "paused")
    return <span className="text-amber-400">paused</span>;
  if (status === "ended") return <span className="text-zinc-500">ended</span>;
  if (status !== "active" || !endsAt || now === null) {
    return <span className="text-zinc-500">—</span>;
  }

  const ms = new Date(endsAt).getTime() - now;
  const expired = ms <= 0;
  return (
    <span
      className={`tabular-nums ${expired ? "text-red-400" : "text-zinc-100"}`}
    >
      {formatRemaining(ms)}
    </span>
  );
}
