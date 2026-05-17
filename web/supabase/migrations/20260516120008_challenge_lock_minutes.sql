-- Per-challenge lock-timer override. null = fall back to the game's
-- challenge_lock_minutes config (default 30).

alter table public.challenges
  add column lock_minutes integer
  check (lock_minutes is null or lock_minutes > 0);

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
  from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;

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

  if v_team_id = any (v_challenge.failed_team_ids) then
    raise exception 'your team already failed this challenge' using errcode = '22023';
  end if;

  if v_challenge.status <> 'open' then
    if v_challenge.status = 'revealed'
       and v_challenge.locked_until is not null
       and v_challenge.locked_until < now() then
      null;
    else
      raise exception 'challenge is not available' using errcode = '22023';
    end if;
  end if;

  v_lock_mins := coalesce(
    v_challenge.lock_minutes,
    (
      select coalesce((config->>'challenge_lock_minutes')::int, 30)
      from public.games where id = v_challenge.game_id
    )
  );

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
