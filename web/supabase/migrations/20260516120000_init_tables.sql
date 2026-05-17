-- Initial schema for the Czech Rail Game.
-- All tables live in the public schema; RLS is enabled in a separate migration.

-- ============================================================
-- Games
-- ============================================================

create table public.games (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  status       text not null default 'lobby'
               check (status in ('lobby', 'active', 'paused', 'ended')),
  config       jsonb not null default jsonb_build_object(
                 'starting_chips', 10,
                 'max_claim_delta', 4,
                 'challenge_lock_minutes', 30
               ),
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- Teams (3 per game, but enforcement lives in app logic)
-- ============================================================

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  name        text not null,
  color       text not null,
  icon        text,
  chips       integer not null default 0 check (chips >= 0),
  created_at  timestamptz not null default now(),
  unique (game_id, color)
);
create index teams_game_id_idx on public.teams (game_id);

-- ============================================================
-- Team membership — one user can only belong to one team per game
-- ============================================================

create table public.team_members (
  user_id    uuid not null references auth.users(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index team_members_team_id_idx on public.team_members (team_id);
create index team_members_game_id_idx on public.team_members (game_id);

-- ============================================================
-- Game admins / game masters
-- ============================================================

create table public.game_admins (
  game_id  uuid not null references public.games(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- ============================================================
-- Stations (global, imported from OSM, not per-game)
-- ============================================================

create table public.stations (
  id          uuid primary key default gen_random_uuid(),
  osm_id      bigint unique,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  kind        text not null check (kind in ('station', 'halt')),
  lines       text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index stations_kind_idx on public.stations (kind);
create index stations_geo_idx on public.stations (lat, lng);

-- ============================================================
-- Current station ownership state (one row per (game, station))
-- ============================================================

create table public.station_claims (
  game_id     uuid not null references public.games(id) on delete cascade,
  station_id  uuid not null references public.stations(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  chip_count  integer not null check (chip_count > 0),
  claimed_at  timestamptz not null default now(),
  primary key (game_id, station_id)
);
create index station_claims_team_idx on public.station_claims (game_id, team_id);

-- ============================================================
-- Append-only claim history
-- ============================================================

create table public.claim_history (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  station_id    uuid not null references public.stations(id),
  team_id       uuid not null references public.teams(id),
  user_id       uuid not null references auth.users(id),
  action        text not null check (action in ('claim', 'reinforce', 'steal')),
  chips_placed  integer not null check (chips_placed > 0),
  chips_after   integer not null,
  created_at    timestamptz not null default now()
);
create index claim_history_game_idx on public.claim_history (game_id, created_at desc);
create index claim_history_station_idx on public.claim_history (station_id);

-- ============================================================
-- Challenges (admin-seeded)
-- ============================================================

create table public.challenges (
  id                    uuid primary key default gen_random_uuid(),
  game_id               uuid not null references public.games(id) on delete cascade,
  town                  text not null,
  lat                   double precision not null,
  lng                   double precision not null,
  type                  text not null check (type in ('ordinary', 'steal', 'multiplier')),
  reward_min            integer not null check (reward_min >= 0),
  reward_max            integer not null check (reward_max >= reward_min),
  title                 text not null,
  description           text not null,
  status                text not null default 'open'
                        check (status in ('open', 'revealed', 'completed', 'failed', 'expired')),
  revealed_by_team_id   uuid references public.teams(id),
  revealed_at           timestamptz,
  locked_until          timestamptz,
  completed_by_team_id  uuid references public.teams(id),
  completed_at          timestamptz,
  reward_awarded        integer,
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);
create index challenges_game_idx on public.challenges (game_id);
create index challenges_status_idx on public.challenges (game_id, status);

-- ============================================================
-- Challenge evidence (optional uploads attached to a challenge)
-- ============================================================

create table public.challenge_evidence (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  team_id       uuid not null references public.teams(id),
  kind          text not null check (kind in ('photo', 'video', 'text')),
  storage_path  text,
  text          text,
  created_at    timestamptz not null default now()
);
create index challenge_evidence_challenge_idx on public.challenge_evidence (challenge_id);

-- ============================================================
-- Append-only event log (powers the action feed + notifications)
-- ============================================================

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_game_idx on public.events (game_id, created_at desc);

-- ============================================================
-- Realtime: publish the tables the clients subscribe to
-- ============================================================

alter publication supabase_realtime add table public.station_claims;
alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.teams;
