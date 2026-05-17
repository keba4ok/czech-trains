-- Game-logic RPCs. SECURITY DEFINER so server-enforced math holds even though
-- station_claims / claim_history / events have no INSERT/UPDATE policies.

-- ============================================================
-- claim_station — claim, reinforce, or steal a station.
-- Validates: game is active; caller is on a team in this game; chips between
-- current+1 and current+max_claim_delta (inclusive); team has enough chips.
-- ============================================================

create or replace function public.claim_station(
  p_game_id      uuid,
  p_station_id   uuid,
  p_chips_placed integer
)
returns public.station_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_team_id        uuid;
  v_team_chips     integer;
  v_current        public.station_claims;
  v_max_delta      integer;
  v_current_chips  integer;
  v_required_min   integer;
  v_action         text;
  v_new_claim      public.station_claims;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_chips_placed is null or p_chips_placed < 1 then
    raise exception 'must place at least 1 chip' using errcode = '22023';
  end if;

  -- Verify the game is active
  perform 1 from public.games where id = p_game_id and status = 'active';
  if not found then
    raise exception 'game is not active' using errcode = '22023';
  end if;

  -- Caller's team in this game
  select team_id into v_team_id
  from public.team_members
  where user_id = v_user_id and game_id = p_game_id;
  if v_team_id is null then
    raise exception 'not a member of this game' using errcode = '42501';
  end if;

  -- Verify the station exists (cheap sanity check; FK would catch it later)
  perform 1 from public.stations where id = p_station_id;
  if not found then
    raise exception 'unknown station' using errcode = '22023';
  end if;

  -- Game config: max chips per visit, default 4
  select coalesce((config->>'max_claim_delta')::int, 4) into v_max_delta
  from public.games where id = p_game_id;

  -- Current claim (locks the row so concurrent claims serialize)
  select * into v_current
  from public.station_claims
  where game_id = p_game_id and station_id = p_station_id
  for update;

  v_current_chips := coalesce(v_current.chip_count, 0);
  v_required_min := v_current_chips + 1;

  if p_chips_placed < v_required_min then
    raise exception 'must place at least % chips (current %)', v_required_min, v_current_chips
      using errcode = '22023';
  end if;
  if p_chips_placed > v_current_chips + v_max_delta then
    raise exception 'max +% chips per visit exceeded', v_max_delta
      using errcode = '22023';
  end if;

  -- Action label
  if v_current.station_id is null then
    v_action := 'claim';
  elsif v_current.team_id = v_team_id then
    v_action := 'reinforce';
  else
    v_action := 'steal';
  end if;

  -- Check + deduct team chips atomically
  select chips into v_team_chips from public.teams where id = v_team_id for update;
  if v_team_chips < p_chips_placed then
    raise exception 'team has % chips, needs %', v_team_chips, p_chips_placed
      using errcode = '22023';
  end if;
  update public.teams set chips = chips - p_chips_placed where id = v_team_id;

  -- Upsert the claim
  insert into public.station_claims (game_id, station_id, team_id, chip_count, claimed_at)
  values (p_game_id, p_station_id, v_team_id, p_chips_placed, now())
  on conflict (game_id, station_id) do update
    set team_id    = excluded.team_id,
        chip_count = excluded.chip_count,
        claimed_at = excluded.claimed_at
  returning * into v_new_claim;

  -- History
  insert into public.claim_history (game_id, station_id, team_id, user_id, action, chips_placed, chips_after)
  values (p_game_id, p_station_id, v_team_id, v_user_id, v_action, p_chips_placed, p_chips_placed);

  -- Event for the feed
  insert into public.events (game_id, type, payload)
  values (
    p_game_id,
    'station_' || v_action,
    jsonb_build_object(
      'station_id', p_station_id,
      'team_id',    v_team_id,
      'user_id',    v_user_id,
      'chips',      p_chips_placed,
      'previous_team_id', v_current.team_id
    )
  );

  return v_new_claim;
end;
$$;

grant execute on function public.claim_station(uuid, uuid, integer) to authenticated;
