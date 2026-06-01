-- When a challenge has been failed by one or more teams, the reward for the
-- next team that completes it is boosted by 25% per prior failure (linear
-- stacking: 1 fail → +25%, 2 fails → +50%, …).
--
-- The boost is applied to the chip delta a team actually gains:
--   * ordinary  — multiply the awarded chip count
--   * multiplier — multiply the *gain* (chips_after - chips_before), which is
--                  equivalent to inflating the (coefficient − 1) part
--   * steal     — multiply the chips transferred from the rival team
--                 (still capped at the rival's current chip total)

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
  v_fail_count     integer;
  v_boost          numeric;
  v_base_reward    integer;
  v_base_after     integer;
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

  v_fail_count := coalesce(array_length(v_challenge.failed_team_ids, 1), 0);
  v_boost := 1.0 + 0.25 * v_fail_count;

  if v_challenge.type = 'ordinary' then
    v_base_reward := coalesce(p_reward_choice, v_challenge.reward_max::integer);
    if v_base_reward < v_challenge.reward_min or v_base_reward > v_challenge.reward_max then
      raise exception
        'reward % outside allowed range %-%',
        v_base_reward, v_challenge.reward_min, v_challenge.reward_max
        using errcode = '22023';
    end if;
    v_reward := floor(v_base_reward * v_boost)::integer;
    update public.teams set chips = chips + v_reward where id = v_team_id;

  elsif v_challenge.type = 'multiplier' then
    select chips into v_team_chips from public.teams where id = v_team_id for update;
    v_base_after := floor(v_team_chips * v_challenge.reward_min)::integer;
    v_reward := floor((v_base_after - v_team_chips) * v_boost)::integer;
    update public.teams
      set chips = v_team_chips + v_reward
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

    v_transfer := floor((v_target_chips * v_challenge.reward_min * v_boost) / 100)::integer;
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
      'town', v_challenge.town,
      'fail_bonus_count', v_fail_count
    )
  );

  if v_should_draw then
    with picked as (
      select id from public.challenges
      where game_id = v_challenge.game_id
        and status = 'open'
        and visible = false
      order by random()
      limit 2
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
