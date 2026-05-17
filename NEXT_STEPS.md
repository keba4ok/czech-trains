# Next Steps — Czech Rail Game

The MVP from §17 of the spec is functionally complete. This doc lists what's
left to take the project from prototype to playable-with-friends, ordered by
real-world importance.

## What's already built (as of 2026-05-16)

- **Auth**: magic-link login, session middleware (proxy.ts), protected layout.
- **Schema**: 10 tables, RLS everywhere, helper functions, realtime publication on `station_claims` / `challenges` / `events` / `teams`.
- **RPCs**: `claim_station`, `reveal_challenge`, `complete_challenge`, `fail_challenge` — all atomic, SECURITY DEFINER, with chip math + event log.
- **Stations**: 1208 imported from OSM (railway=station only; `playable` flag for future curation).
- **Game lifecycle**: lobby → active. Pause/end exist in the schema but no UI.
- **Lobby**: self-pick team (3 default), hex color picker per team, shareable invite link.
- **Map**: full-viewport Leaflet on CartoDB dark tiles, station markers recolor live, bottom sheet for claim flow.
- **Challenges**: emoji markers per type (📍 ordinary / ⚡ steal / ⭐ multiplier), reveal lock (per-challenge override), complete with type-specific UI (chip-range / multiplier / target-team picker), fail with `failed_team_ids` tracking.
- **Admin**: create game, seed challenges via form + bulk JSON import (`reward` shorthand, `lock_minutes` override), per-challenge edit/delete page.
- **Feed**: `/games/[id]/feed` with realtime subscription and per-event-type rendering for stations and challenges.

## Sprint 1 — playtest blockers

These four are the actual gap between "demo" and "we played a real game."

### 1. Challenge auto-draw deck (already requested)
- New `visible` + `triggered_new_batch` columns on `challenges`.
- `draw_random_challenges(game_id, n)` RPC.
- Game start deals 6; first complete/fail per challenge deals 3 more (success-or-fail trigger, only once per challenge).
- Bulk import defaults `visible = false`; JSON `"visible": true` opts a specific one out.
- Map only renders `visible = true` (admin sees all, with a small "hidden" badge).
- Estimated effort: ~1 evening.

### 2. Scoreboard
- `/games/[id]/scoreboard` page: per-team chips, stations owned, challenges completed, steals dealt/received.
- Live via realtime on `teams`, `station_claims`, `events`.
- Tiny scoreboard widget in the map HUD (top-right next to the station count) showing chip totals across the 3 teams.
- Estimated effort: ~1 evening.

### 3. Game timer + pause / end
- Add `duration_hours` to `games.config` (default 24).
- HUD shows live countdown to `ends_at`.
- Admin can pause (status → `paused`), resume (→ `active`), end early (→ `ended`) from a small admin panel on the map page.
- All mutation RPCs reject when status is `paused` or `ended`.
- Estimated effort: ~half day.

### 4. Deploy to Vercel + production Supabase config
- Vercel project linked to the repo, env vars set (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`).
- Add production URL to Supabase **Authentication → URL Configuration → Redirect URLs**.
- Verify magic-link round-trip on prod.
- Real-device smoke test on iPhone Safari (the audience) — specifically Leaflet tap targets, sheet sizing, magic-link redirects.
- Estimated effort: ~half day if no surprises.

## Sprint 2 — polish before sharing the link

### Mobile UX pass
- Audit tap-target sizes (current ≥40px, push to 44px where tight).
- Make sure bottom sheets don't blanket-block the map (current full-width is fine on mobile, but on iPad it's huge — cap at `max-w-md` always).
- Test orientation changes — Leaflet should re-render automatically; verify.
- PWA manifest + apple-touch-icon so it installs cleanly to the home screen.
- iOS Safari address-bar collapse hides 60px of viewport on first scroll; size the HUD accordingly.

### Live event toast on map
- When a new event arrives via realtime and you're on the map page, slide in a 5s toast top-center: "Red stole Pardubice from Blue."
- Tap the toast to fly the map to that station/challenge.

### Inline feed widget
- Bottom-right corner: last 3 events as a tiny semi-transparent stack. Tap → opens full `/feed`. Frees players from leaving the map to follow action.

### Station search
- Top-left HUD: small search input with autocomplete on the 1208 stations. Tap a result → fly to it on the map. Useful when teams discuss strategy.

## Backlog — after the first real playtest

Everything below is keep-but-not-now. Most depends on what we learn from playing the game on real trains:

- **GPS proximity for claims** — only allowable from within ~200m of the station. (Originally cut as "trust-based for friends"; reintroduce if cheating becomes a thing.)
- **Photo evidence upload + admin approval** — Supabase Storage bucket + a `/games/[id]/admin/review` queue.
- **Replay** — timeline scrubber over `events`, animated map.
- **Spectator-only mode** (delayed 15-30 min) — for friends-of-friends following along.
- **Push notifications** — web push first, native later.
- **Analytics dashboard** — most-contested stations, team heatmaps, chip economy graph.
- **Native iPhone app** — RN or Flutter sharing the Supabase backend.
- **Dispute system** — contest a completion, admin reviews.
- **Nearby-team alerts** — push when two teams converge on the same town.
- **Full offline action queue** — service worker queues claims/completes when offline, syncs on reconnect.
- **Station decay** — chips drain off claims over time so old territory gets re-contested.
- **Map-based location picker for admin** — click map → fills lat/lng in the new-challenge form.
- **Curated station set** — manually mark which of the 1208 stations are actually "in play" via the existing `playable` flag (we have the column, just no UI).

## Suggested order

1. **Sprint 1 in the listed order** — auto-draw → scoreboard → timer/pause → deploy.
2. **First playtest** with the friend group, even if rough.
3. **Sprint 2 polish** informed by what was actually painful in the playtest.
4. **Backlog pick-and-choose** based on whether the game wants to grow (more games, more players) or stay friend-only.
