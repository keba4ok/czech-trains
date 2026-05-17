import Link from "next/link";
import { redirect } from "next/navigation";
import FeedClient, { type FeedEvent } from "@/components/FeedClient";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export default async function FeedPage({ params }: { params: Params }) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, name, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) redirect(`/games/${gameId}/join`);

  const [{ data: events }, { data: teams }] = await Promise.all([
    supabase
      .from("events")
      .select("id, type, payload, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("game_id", gameId),
  ]);

  // Look up station names for every event that references a station.
  const stationIds = new Set<string>();
  for (const e of (events ?? []) as FeedEvent[]) {
    const sid = e.payload?.station_id;
    if (sid) stationIds.add(sid);
  }
  let stationRows: { id: string; name: string }[] = [];
  if (stationIds.size > 0) {
    const { data } = await supabase
      .from("stations")
      .select("id, name")
      .in("id", Array.from(stationIds));
    stationRows = data ?? [];
  }

  const stationLookup: Record<string, { name: string }> = {};
  for (const s of stationRows) stationLookup[s.id] = { name: s.name };

  const teamLookup: Record<string, { name: string; color: string }> = {};
  for (const t of teams ?? []) teamLookup[t.id] = { name: t.name, color: t.color };

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="flex w-full max-w-md flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Feed — {game.status}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {game.name}
          </h1>
          <Link
            href={`/games/${gameId}`}
            className="shrink-0 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
          >
            ← map
          </Link>
        </div>
      </div>

      <div className="w-full max-w-md">
        <FeedClient
          gameId={gameId}
          initialEvents={(events ?? []) as FeedEvent[]}
          stations={stationLookup}
          teams={teamLookup}
        />
      </div>
    </main>
  );
}
