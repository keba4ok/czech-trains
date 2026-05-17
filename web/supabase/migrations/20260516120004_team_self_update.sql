-- Allow team members (not just admins) to update their team's name and color,
-- so players can pick a team identity in the lobby.

drop policy teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (
    public.is_admin_of_game(game_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin_of_game(game_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  );
