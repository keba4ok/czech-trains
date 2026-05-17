-- Row-level security and policy helpers.
-- Convention: members of a game can read game data; admins can mutate. Station claims
-- and the events log are write-only via SECURITY DEFINER RPC functions (see next migration).

-- ============================================================
-- Helpers (SECURITY DEFINER so policies can call them without recursion)
-- ============================================================

create or replace function public.is_member_of_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where game_id = p_game_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin_of_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_admins
    where game_id = p_game_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_member_of_game(uuid) to authenticated;
grant execute on function public.is_admin_of_game(uuid) to authenticated;

-- ============================================================
-- Enable RLS on every game-scoped table
-- ============================================================

alter table public.games              enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.game_admins        enable row level security;
alter table public.stations           enable row level security;
alter table public.station_claims     enable row level security;
alter table public.claim_history      enable row level security;
alter table public.challenges         enable row level security;
alter table public.challenge_evidence enable row level security;
alter table public.events             enable row level security;

-- ============================================================
-- Stations: world-readable to any authenticated user (global data)
-- Inserts/updates/deletes only via service role (importer).
-- ============================================================

create policy stations_select on public.stations
  for select to authenticated using (true);

-- ============================================================
-- Games
-- ============================================================

create policy games_select on public.games
  for select to authenticated
  using (
    public.is_member_of_game(id)
    or public.is_admin_of_game(id)
    or created_by = auth.uid()
  );

create policy games_insert on public.games
  for insert to authenticated
  with check (created_by = auth.uid());

create policy games_update on public.games
  for update to authenticated
  using (public.is_admin_of_game(id));

-- ============================================================
-- Teams
-- ============================================================

create policy teams_select on public.teams
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

create policy teams_insert on public.teams
  for insert to authenticated
  with check (public.is_admin_of_game(game_id));

create policy teams_update on public.teams
  for update to authenticated
  using (public.is_admin_of_game(game_id));

create policy teams_delete on public.teams
  for delete to authenticated
  using (public.is_admin_of_game(game_id));

-- ============================================================
-- Team members — players self-pick (insert their own row); admins manage
-- ============================================================

create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid());

create policy team_members_update on public.team_members
  for update to authenticated
  using (public.is_admin_of_game(game_id));

create policy team_members_delete on public.team_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin_of_game(game_id));

-- ============================================================
-- Game admins — game creator can bootstrap themselves; existing admins can add more
-- ============================================================

create policy game_admins_select on public.game_admins
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

create policy game_admins_insert on public.game_admins
  for insert to authenticated
  with check (
    public.is_admin_of_game(game_id)
    or exists (
      select 1 from public.games g
      where g.id = game_id and g.created_by = auth.uid()
    )
  );

create policy game_admins_delete on public.game_admins
  for delete to authenticated
  using (public.is_admin_of_game(game_id));

-- ============================================================
-- Station claims — read-only via RLS; mutations go through claim_station RPC
-- ============================================================

create policy station_claims_select on public.station_claims
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

-- ============================================================
-- Claim history — read-only; the RPC inserts as SECURITY DEFINER
-- ============================================================

create policy claim_history_select on public.claim_history
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

-- ============================================================
-- Challenges — members read all rows; the app hides title/description when status='open'
-- ============================================================

create policy challenges_select on public.challenges
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));

create policy challenges_insert on public.challenges
  for insert to authenticated
  with check (public.is_admin_of_game(game_id));

create policy challenges_update on public.challenges
  for update to authenticated
  using (public.is_admin_of_game(game_id));

create policy challenges_delete on public.challenges
  for delete to authenticated
  using (public.is_admin_of_game(game_id));

-- ============================================================
-- Challenge evidence — team members of the evidence row's team can insert
-- ============================================================

create policy challenge_evidence_select on public.challenge_evidence
  for select to authenticated
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and (public.is_member_of_game(c.game_id) or public.is_admin_of_game(c.game_id))
    )
  );

create policy challenge_evidence_insert on public.challenge_evidence
  for insert to authenticated
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid() and tm.team_id = team_id
    )
  );

-- ============================================================
-- Events — read-only via RLS; RPCs insert as SECURITY DEFINER
-- ============================================================

create policy events_select on public.events
  for select to authenticated
  using (public.is_member_of_game(game_id) or public.is_admin_of_game(game_id));
