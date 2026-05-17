-- Challenge-flow RPCs. SECURITY DEFINER so the row updates and chip transfers
-- happen atomically regardless of the table RLS policies.

-- ============================================================
-- reveal_challenge — lock an open challenge to the caller's team
-- ============================================================
create or replace function public.reveal_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_team_id    uuid;
  v_challenge  public.challenges;
  v_lock_mins  integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;
  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;

  -- Caller's team in this game
  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.user_id = v_user_id and tm.game_id = v_challenge.game_id;
  if v_team_id is null then
    raise exception 'not a member of this game' using errcode = '42501';
  end if;

  perform 1 from public.games where id = v_challenge.game_id and status = 'active';
  if not found then
    raise exception 'game is not active' using errcode = '22023';
  end if;

  -- Allow reveal if status='open' OR status='revealed' with expired lock.
  if v_challenge.status <> 'open' then
    if v_challenge.status = 'revealed'
       and v_challenge.locked_until is not null
       and v_challenge.locked_until < now() then
      null; -- expired lock, fine to take over
    else
      raise exception 'challenge is not available' using errcode = '22023';
    end if;
  end if;

  select coalesce((config->>'challenge_lock_minutes')::int, 30) into v_lock_mins
  from public.games where id = v_challenge.game_id;

  update public.challenges
  set status = 'revealed',
      revealed_by_team_id = v_team_id,
      revealed_at = now(),
      locked_until = now() + (v_lock_mins || ' minutes')::interval
  where id = p_challenge_id
  returning * into v_challenge;

  insert into public.events (game_id, type, payload)
  values (
    v_challenge.game_id,
    'challenge_revealed',
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'team_id', v_team_id,
      'user_id', v_user_id,
      'town', v_challenge.town,
      'challenge_type', v_challenge.type
    )
  );

  return v_challenge;
end;
$$;

grant execute on function public.reveal_challenge(uuid) to authenticated;

-- ============================================================
-- complete_challenge — apply the reward and mark completed
-- ============================================================
create or replace function public.complete_challenge(
  p_challenge_id    uuid,
  p_reward_choice   integer default null,
  p_target_team_id  uuid default null
)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_team_id        uuid;
  v_challenge      public.challenges;
  v_reward         integer;
  v_target_chips   integer;
  v_team_chips     integer;
  v_transfer       integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;
  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;

  if v_challenge.status <> 'revealed' then
    raise exception 'challenge is not in a revealed state' using errcode = '22023';
  end if;

  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.user_id = v_user_id and tm.game_id = v_challenge.game_id;
  if v_team_id is null or v_team_id <> v_challenge.revealed_by_team_id then
    raise exception 'only the revealing team can complete' using errcode = '42501';
  end if;

  if v_challenge.type = 'ordinary' then
    v_reward := coalesce(p_reward_choice, v_challenge.reward_max);
    if v_reward < v_challenge.reward_min or v_reward > v_challenge.reward_max then
      raise exception
        'reward % outside allowed range %-%',
        v_reward, v_challenge.reward_min, v_challenge.reward_max
        using errcode = '22023';
    end if;
    update public.teams set chips = chips + v_reward where id = v_team_id;

  elsif v_challenge.type = 'multiplier' then
    -- reward_min holds the single multiplier factor
    select chips into v_team_chips from public.teams where id = v_team_id for update;
    v_reward := v_team_chips * v_challenge.reward_min - v_team_chips; -- delta
    update public.teams set chips = chips * v_challenge.reward_min where id = v_team_id;

  elsif v_challenge.type = 'steal' then
    if p_target_team_id is null then
      raise exception 'target team required for steal' using errcode = '22023';
    end if;
    if p_target_team_id = v_team_id then
      raise exception 'cannot steal from your own team' using errcode = '22023';
    end if;
    perform 1 from public.teams
      where id = p_target_team_id and game_id = v_challenge.game_id;
    if not found then
      raise exception 'target team is not in this game' using errcode = '22023';
    end if;

    select chips into v_target_chips
    from public.teams where id = p_target_team_id for update;

    -- reward_min is the percent (1..100)
    v_transfer := (v_target_chips * v_challenge.reward_min) / 100;
    if v_target_chips > 0 and v_transfer < 1 then v_transfer := 1; end if;
    if v_transfer > v_target_chips then v_transfer := v_target_chips; end if;

    update public.teams set chips = chips - v_transfer where id = p_target_team_id;
    update public.teams set chips = chips + v_transfer where id = v_team_id;
    v_reward := v_transfer;

  else
    raise exception 'unknown challenge type %', v_challenge.type using errcode = '22023';
  end if;

  update public.challenges
  set status = 'completed',
      completed_by_team_id = v_team_id,
      completed_at = now(),
      reward_awarded = v_reward,
      locked_until = null
  where id = p_challenge_id
  returning * into v_challenge;

  insert into public.events (game_id, type, payload)
  values (
    v_challenge.game_id,
    'challenge_completed',
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'team_id', v_team_id,
      'user_id', v_user_id,
      'reward', v_reward,
      'challenge_type', v_challenge.type,
      'target_team_id', p_target_team_id,
      'town', v_challenge.town
    )
  );

  return v_challenge;
end;
$$;

grant execute on function public.complete_challenge(uuid, integer, uuid) to authenticated;

-- ============================================================
-- skip_challenge — release lock, mark open again
-- ============================================================
create or replace function public.skip_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_team_id   uuid;
  v_challenge public.challenges;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_challenge
  from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;

  if v_challenge.status <> 'revealed' then
    raise exception 'challenge is not in a revealed state' using errcode = '22023';
  end if;

  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.user_id = v_user_id and tm.game_id = v_challenge.game_id;
  if v_team_id is null or v_team_id <> v_challenge.revealed_by_team_id then
    raise exception 'only the revealing team can skip' using errcode = '42501';
  end if;

  update public.challenges
  set status = 'open',
      revealed_by_team_id = null,
      revealed_at = null,
      locked_until = null
  where id = p_challenge_id
  returning * into v_challenge;

  insert into public.events (game_id, type, payload)
  values (
    v_challenge.game_id,
    'challenge_skipped',
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'team_id', v_team_id,
      'user_id', v_user_id,
      'town', v_challenge.town
    )
  );

  return v_challenge;
end;
$$;

grant execute on function public.skip_challenge(uuid) to authenticated;
