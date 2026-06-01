-- Open admin: every authenticated user (including anonymous Supabase sessions)
-- is treated as admin of every game. This sidesteps email-based auth — anyone
-- with a session can create games, add challenges, and run the timer.
--
-- The game_admins table is still maintained (created_by bootstrap row), but
-- it's no longer the source of truth for permission checks.

create or replace function public.is_admin_of_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;
