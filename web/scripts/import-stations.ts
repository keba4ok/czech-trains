/**
 * One-off importer for Czech Republic railway stations and halts from OpenStreetMap.
 * Idempotent: upserts by osm_id, so re-running just refreshes the row data.
 *
 * Run with:  pnpm db:import-stations
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local",
  );
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Pull every node tagged railway=station or railway=halt inside the Czech Republic.
const QUERY = `
[out:json][timeout:120];
area["ISO3166-1"="CZ"][admin_level=2]->.cz;
(
  node["railway"="station"](area.cz);
  node["railway"="halt"](area.cz);
);
out body;
`.trim();

type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};
type OverpassResponse = { elements: OverpassNode[] };

type StationRow = {
  osm_id: number;
  name: string;
  lat: number;
  lng: number;
  kind: "station" | "halt";
  lines: string[];
};

async function fetchOSM(): Promise<OverpassNode[]> {
  console.log("Querying Overpass for CZ railway stations + halts…");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(QUERY)}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Overpass policy requires a descriptive UA; anonymous requests are rejected with 406.
      "User-Agent": "trains-game-importer/0.1 (ivan.kabashnyi@jetbrains.com)",
    },
  });
  if (!res.ok) {
    throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as OverpassResponse;
  return data.elements.filter((e) => e.type === "node");
}

function nodeToRow(n: OverpassNode): StationRow | null {
  const name = n.tags?.name ?? n.tags?.["name:cs"] ?? n.tags?.["name:en"];
  if (!name) return null;
  const kind = n.tags?.railway === "halt" ? "halt" : "station";
  return {
    osm_id: n.id,
    name,
    lat: n.lat,
    lng: n.lon,
    kind,
    lines: [],
  };
}

async function main() {
  const nodes = await fetchOSM();
  console.log(`Overpass returned ${nodes.length} nodes.`);

  const rows = nodes
    .map(nodeToRow)
    .filter((r): r is StationRow => r !== null);
  const skipped = nodes.length - rows.length;
  console.log(
    `Keeping ${rows.length}; skipping ${skipped} unnamed/anonymous nodes.`,
  );

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET!, {
    auth: { persistSession: false },
  });

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("stations")
      .upsert(slice, { onConflict: "osm_id" });
    if (error) {
      throw new Error(`Upsert failed at batch ${i}: ${error.message}`);
    }
    console.log(`Upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}.`);
  }

  const { count, error: countErr } = await supabase
    .from("stations")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;
  console.log(`Done. Total stations in DB: ${count}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
