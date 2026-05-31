/**
 * One-off importer for railway stations from OpenStreetMap.
 * Idempotent: upserts by osm_id, so re-running just refreshes the row data.
 *
 * Run with:  pnpm db:import-stations:czech
 *            pnpm db:import-stations:berlin
 *
 * The legacy `pnpm db:import-stations` alias still imports the Czech set.
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

type RegionId = "czech" | "berlin";

type RegionConfig = {
  query: string;
  /** Maps an Overpass node to its station `kind`, or `null` to skip it. */
  kindOf: (tags: Record<string, string> | undefined) => "station" | "halt" | null;
};

const REGIONS: Record<RegionId, RegionConfig> = {
  // Every CZ node tagged railway=station or railway=halt.
  czech: {
    query: `
[out:json][timeout:120];
area["ISO3166-1"="CZ"][admin_level=2]->.cz;
(
  node["railway"="station"](area.cz);
  node["railway"="halt"](area.cz);
);
out body;
`.trim(),
    kindOf: (tags) => (tags?.railway === "halt" ? "halt" : "station"),
  },
  // Berlin U-Bahn (subway) + S-Bahn (light_rail) stations.
  berlin: {
    query: `
[out:json][timeout:120];
area["name"="Berlin"]["admin_level"="4"]->.bln;
(
  node["railway"="station"]["station"="subway"](area.bln);
  node["railway"="station"]["station"="light_rail"](area.bln);
);
out body;
`.trim(),
    kindOf: () => "station",
  },
};

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
  region: RegionId;
};

function parseRegion(): RegionId {
  const idx = process.argv.indexOf("--region");
  const raw =
    idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : "czech";
  if (raw !== "czech" && raw !== "berlin") {
    throw new Error(
      `Unknown --region "${raw}". Valid values: czech, berlin.`,
    );
  }
  return raw;
}

async function fetchOSM(region: RegionId): Promise<OverpassNode[]> {
  const { query } = REGIONS[region];
  console.log(`Querying Overpass for ${region} railway stations…`);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
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

function nodeToRow(n: OverpassNode, region: RegionId): StationRow | null {
  const name = n.tags?.name ?? n.tags?.["name:cs"] ?? n.tags?.["name:en"];
  if (!name) return null;
  const kind = REGIONS[region].kindOf(n.tags);
  if (!kind) return null;
  return {
    osm_id: n.id,
    name,
    lat: n.lat,
    lng: n.lon,
    kind,
    lines: [],
    region,
  };
}

async function main() {
  const region = parseRegion();
  const nodes = await fetchOSM(region);
  console.log(`Overpass returned ${nodes.length} nodes.`);

  const rows = nodes
    .map((n) => nodeToRow(n, region))
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
    .select("*", { count: "exact", head: true })
    .eq("region", region);
  if (countErr) throw countErr;
  console.log(`Done. Total ${region} stations in DB: ${count}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
