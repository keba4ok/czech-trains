-- Let a user move their own team_members row to a different team within the
-- same game (i.e. switch teams in the lobby). The original policy only
-- allowed admins to update, which caused upsert-on-conflict to silently
-- no-op when a player tried to switch.

drop policy team_members_update on public.team_members;
create policy team_members_update on public.team_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_of_game(game_id))
  with check (user_id = auth.uid() or public.is_admin_of_game(game_id));
