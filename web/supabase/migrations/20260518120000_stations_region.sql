-- Tag every station with the region it belongs to so a single stations table
-- can back multiple regional games (Czech Republic, Berlin U+S Bahn, ...).
-- Existing rows are all Czech (imported via the OSM Overpass query for CZ).

alter table public.stations
  add column region text not null default 'czech'
  check (region in ('czech', 'berlin'));

-- The per-game map query is "stations where region = ? and playable", so
-- swap the playable-only index for a region-partitioned one.
drop index if exists stations_playable_idx;
create index stations_region_playable_idx
  on public.stations (region)
  where playable;
