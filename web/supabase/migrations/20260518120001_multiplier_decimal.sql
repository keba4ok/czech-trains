-- Allow multiplier rewards to be non-integer (e.g. 1.2× – 1.7×).
--
-- reward_min/reward_max widen from integer to numeric. teams.chips and
-- challenges.reward_awarded stay integer, so the multiplier and steal paths
-- in complete_challenge now floor the arithmetic explicitly before writing
-- back. Ordinary challenges still store integer chip counts (the server-side
-- validator continues to enforce that), so behaviour for existing data is
-- unchanged.

alter table public.challenges
  alter column reward_min type numeric using reward_min::numeric;
alter table public.challenges
  alter column reward_max type numeric using reward_max::numeric;

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
  v_should_draw    boolean;
  v_drawn          integer;
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

  perform 1 from public.games where id = v_challenge.game_id and status = 'active';
  if not found then
    raise exception 'game is not active' using errcode = '22023';
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

  v_should_draw := not v_challenge.triggered_new_batch;

  if v_challenge.type = 'ordinary' then
    -- Ordinary rewards are integer chip counts (enforced by the server-side
    -- validator), so the numeric column casts losslessly here.
    v_reward := coalesce(p_reward_choice, v_challenge.reward_max::integer);
    if v_reward < v_challenge.reward_min or v_reward > v_challenge.reward_max then
      raise exception
        'reward % outside allowed range %-%',
        v_reward, v_challenge.reward_min, v_challenge.reward_max
        using errcode = '22023';
    end if;
    update public.teams set chips = chips + v_reward where id = v_team_id;

  elsif v_challenge.type = 'multiplier' then
    -- reward_min is now the (possibly fractional) multiplier coefficient.
    -- teams.chips stays integer, so floor the product before writing back.
    select chips into v_team_chips from public.teams where id = v_team_id for update;
    v_reward := floor(v_team_chips * v_challenge.reward_min)::integer - v_team_chips;
    update public.teams
      set chips = floor(chips * v_challenge.reward_min)::integer
      where id = v_team_id;

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

    -- reward_min stores the steal percent (1..100). Cast to integer after
    -- the multiply/divide so a numeric column type doesn't leak decimals
    -- into v_transfer.
    v_transfer := floor((v_target_chips * v_challenge.reward_min) / 100)::integer;
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
      locked_until = null,
      triggered_new_batch = true
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

  if v_should_draw then
    with picked as (
      select id from public.challenges
      where game_id = v_challenge.game_id
        and status = 'open'
        and visible = false
      order by random()
      limit 3
      for update skip locked
    )
    update public.challenges c
    set visible = true
    from picked
    where c.id = picked.id;

    get diagnostics v_drawn = row_count;

    if v_drawn > 0 then
      insert into public.events (game_id, type, payload)
      values (
        v_challenge.game_id,
        'challenges_drawn',
        jsonb_build_object(
          'count', v_drawn,
          'trigger', 'complete',
          'challenge_id', v_challenge.id
        )
      );
    end if;
  end if;

  return v_challenge;
end;
$$;
