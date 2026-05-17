# Czech Rail Game — MVP Implementation Plan

Scope: §17 MVP from `czech_rail_game_platform_spec.md`, **trust-based** (no anti-cheat, no evidence approval — playing with friends).

## 1. Locked decisions

| Area | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) — no separate Node server |
| Map | Leaflet via `react-leaflet`, OSM raster tiles |
| Station data | OpenStreetMap, queried once via Overpass API and imported to Postgres |
| Auth | Supabase magic-link email |
| Hosting | Vercel (frontend) + Supabase (managed) |
| Claim verification | None — player taps Claim from anywhere |
| Challenge verification | None — team self-reports completion, chips awarded immediately |

## 2. Data model (Postgres)

Tables (Supabase + RLS):

- **`games`** — `id`, `name`, `status` (`lobby`/`active`/`paused`/`ended`), `config` (jsonb: `max_chips_per_claim_delta=4`, `starting_chips`, `game_duration_hours`, `challenge_lock_minutes`), `starts_at`, `ends_at`, `created_by`.
- **`teams`** — `id`, `game_id`, `name`, `color` (`red`/`blue`/`green`), `icon`, `chips` (int).
- **`team_members`** — `user_id`, `team_id`, `joined_at`. (One user can only be in one team per game; enforced via unique constraint on `(user_id, game_id)` via a generated column or trigger.)
- **`game_admins`** — `game_id`, `user_id`. Game-master ACL.
- **`stations`** — `id`, `osm_id`, `name`, `lat`, `lng`, `kind` (`station`/`halt`), `lines` (text[]). Global, not per-game.
- **`station_claims`** — current state: `game_id`, `station_id`, `team_id`, `chip_count`, `claimed_at`. PK `(game_id, station_id)`.
- **`claim_history`** — append-only log: `id`, `game_id`, `station_id`, `team_id`, `user_id`, `action` (`claim`/`reinforce`/`steal`), `chips_placed`, `chips_after`, `created_at`.
- **`challenges`** — `id`, `game_id`, `town`, `lat`, `lng`, `type` (`ordinary`/`steal`/`multiplier`), `reward_min`, `reward_max`, `title` (hidden), `description` (hidden), `status` (`open`/`revealed`/`completed`/`failed`/`expired`), `revealed_by_team_id`, `revealed_at`, `locked_until`, `completed_by_team_id`, `completed_at`, `reward_awarded`, `created_by`.
- **`challenge_evidence`** — `id`, `challenge_id`, `team_id`, `kind` (`photo`/`video`/`text`), `storage_path`, `text`, `created_at`. Optional, not enforced.
- **`events`** — `id`, `game_id`, `type`, `payload` (jsonb), `created_at`. Append-only feed; backs the action log and notifications.

RLS sketch:
- Anyone in a game can read all `games`/`teams`/`stations`/`station_claims`/`events` rows for that game.
- Players can write `claim_history` / mutate `station_claims` only for their own team. Server-side checks via Postgres functions (RPC) to enforce chip math and validity.
- `game_admins` bypass RLS via a `claims` check.
- `challenges` description/title rows: visible to all once `status != 'open'` OR `revealed_by_team_id` matches current user's team.

## 3. Server logic (Postgres RPC functions)

Game logic enforced in SQL functions to keep client honest even without anti-cheat:

- `claim_station(game_id, station_id, chips_placed)` — validates: game active, player on a team, `chips_placed >= current.chip_count + 1`, `chips_placed <= current.chip_count + max_delta`, team has enough chips; writes `claim_history`, upserts `station_claims`, deducts team chips, inserts `event`.
- `reveal_challenge(challenge_id)` — sets `status='revealed'`, `revealed_by_team_id`, `locked_until = now() + interval`. Emits event with hidden info revealed.
- `complete_challenge(challenge_id, reward)` — sets `status='completed'`, adds chips to revealing team, emits event. Trust-based: team picks the reward within the declared range (or admin sets exact reward when seeding).
- `skip_challenge(challenge_id)` — sets `status='open'` again, clears reveal lock so others can try; emits event.

## 4. Realtime

Supabase Realtime channels per game:
- Subscribe to `station_claims`, `challenges`, `events`, `teams` filtered by `game_id`.
- Map markers, scoreboard, and action feed all hydrate from the same store and re-render on row changes.

## 5. Frontend surface

```
app/
  (auth)/login/page.tsx         magic-link form
  (app)/
    layout.tsx                  bottom nav: Map · Challenges · Team · Feed · Rules
    map/page.tsx                primary screen — Leaflet, station + challenge markers, top HUD (chips, timer)
    challenges/page.tsx         list of revealed/locked challenges for the player's team
    team/page.tsx               team roster, chips, claimed stations
    feed/page.tsx               event log
    rules/page.tsx              static rules + current game config
  admin/
    games/page.tsx              list, create
    games/[id]/page.tsx         manage teams, players, challenges, event log, manual chip transfer
components/
  Map/StationMarker.tsx
  Map/ChallengeMarker.tsx
  Map/MapView.tsx               client-only, dynamic import (Leaflet needs window)
  Sheet/StationSheet.tsx        bottom sheet, "Claim N chips" CTA
  Sheet/ChallengeSheet.tsx      Reveal / Attempt / Skip / Complete
  HUD/Timer.tsx
  HUD/ChipBalance.tsx
lib/
  supabase/{client,server,admin}.ts
  game/{claim,challenge,events}.ts   thin wrappers around RPC calls
  realtime/useGameSubscription.ts
  osm/import.ts                  one-off Overpass importer
```

Mobile-first: dark mode by default, large tap targets (≥44pt), all critical actions reachable in 1–2 taps, map fills the viewport behind a translucent HUD.

## 6. OSM import script

One-off Node script (`scripts/import-stations.ts`):
1. POST to Overpass: `[out:json]; area["ISO3166-1"="CZ"]->.cz; (node["railway"~"station|halt"](area.cz);); out;`
2. Map nodes → `stations` rows, upsert by `osm_id`.
3. Run with `pnpm tsx scripts/import-stations.ts` against the Supabase service role key.

## 7. Milestones

Ordered; each milestone is a stopping point that demos something.

1. **Repo scaffold** — Next.js + TS + Tailwind, Supabase project, env wiring, deploy a "hello" page to Vercel.
2. **Auth** — magic-link login, session middleware, protected layout.
3. **Schema + RLS** — migrations for all tables, RLS policies, seed one admin user.
4. **OSM station import** — script + verify ~3000 CZ stations land in DB.
5. **Read-only map** — render all stations as plain circles on Leaflet, no claiming yet. (Demo.)
6. **Game + team management** — admin creates a game and its 3 teams; players receive a join link/code, log in, and self-pick a team from the 3 on offer.
7. **Station claim flow** — bottom sheet, `claim_station` RPC, station marker recolors live, action log emits. (Core gameplay live.)
8. **Action feed** — `/feed` page subscribed to `events`.
9. **Challenges (admin CRUD)** — admin pre-seeds challenges with lat/lng, type, reward range, title/description.
10. **Challenge reveal/complete (player)** — markers on map, reveal flow, complete flow, chips awarded.
11. **Scoreboard** — `/team` aggregates, plus a per-game summary.
12. **Game timer + pause** — `games.starts_at` / `ends_at`, admin pause toggles `status`.
13. **Mobile polish** — dark mode, bottom nav, PWA manifest, install prompt.
14. **Deploy + playtest** — production Supabase + Vercel, run a small playtest.

## 8. Out of scope (backlog)

Anti-cheat (GPS, QR), admin evidence approval, replay system, spectator mode, push notifications, analytics/heatmaps, native iPhone app, dispute system, nearby-team alerts, full offline action queue, "spawn 3 new challenges on completion" auto-generator, station decay rules.

## 9. Locked answers & remaining open questions

**Locked (2026-05-16):**
- **Team assignment**: players self-pick. The join-game flow shows the 3 teams and lets the player pick one (subject to capacity rules TBD — default: no cap, any player can join any team).
- **Challenge authoring**: admin pre-seeds the full challenge set before the game starts, since challenges are location-specific. No in-game challenge generation in MVP.

**Still open (can be tuned later, not blocking):**
- **Chip economy starting values**: e.g. `starting_chips = 10`, `max_claim_delta = 4`. Live in `games.config`.
- **Game timer behavior overnight**: auto-pause window or just manual admin pause? (Default: manual for MVP.)
- **Team switching after join**: allowed or locked once chosen? (Default: locked; admin can override.)
