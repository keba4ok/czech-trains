-- Shrink the post-resolution batch draw from 3 to 2. Combined with the smaller
-- opening hand (5 instead of 6, set on the server side in join/actions.ts), the
-- visible deck stays leaner so players see fewer challenges at once and have to
-- commit to the ones currently on the map.
--
-- complete_challenge is redefined in 20260601120000_failed_challenge_bonus.sql
-- with limit 2 already; this migration only needs to bring fail_challenge in
-- line.

create or replace function public.fail_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_team_id     uuid;
  v_challenge   public.challenges;
  v_should_draw boolean;
  v_drawn       integer;
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
    raise exception 'only the revealing team can fail this' using errcode = '42501';
  end if;

  v_should_draw := not v_challenge.triggered_new_batch;

  update public.challenges
  set status = 'open',
      revealed_by_team_id = null,
      revealed_at = null,
      locked_until = null,
      failed_team_ids = array_append(failed_team_ids, v_team_id),
      triggered_new_batch = true
  where id = p_challenge_id
  returning * into v_challenge;

  insert into public.events (game_id, type, payload)
  values (
    v_challenge.game_id,
    'challenge_failed',
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'team_id', v_team_id,
      'user_id', v_user_id,
      'town', v_challenge.town,
      'challenge_type', v_challenge.type
    )
  );

  if v_should_draw then
    with picked as (
      select id from public.challenges
      where game_id = v_challenge.game_id
        and status = 'open'
        and visible = false
        and id <> v_challenge.id
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
          'trigger', 'fail',
          'challenge_id', v_challenge.id
        )
      );
    end if;
  end if;

  return v_challenge;
end;
$$;
