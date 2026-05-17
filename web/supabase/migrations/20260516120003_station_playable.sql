-- Drop the OSM "halt" rows (minor unstaffed platforms) and add a playable flag
-- so we can later opt individual stations out of gameplay without re-importing.

alter table public.stations
  add column playable boolean not null default true;

delete from public.stations where kind = 'halt';

-- Helps the map's primary query: select * from stations where playable.
create index stations_playable_idx on public.stations (playable) where playable;
