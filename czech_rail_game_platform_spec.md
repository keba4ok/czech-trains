# Czech Rail Strategy Game — Web Platform Specification

## Overview
A web platform for a real-world multiplayer rail strategy game inspired by Jet Lag: The Game.

Players travel physically across the Czech Republic using trains, claiming stations, completing location-based challenges, and competing for territory.

The platform should support:
- Real-time map gameplay
- Three competing teams
- Station claiming system
- Challenge generation/reveal system
- Mobile-first gameplay
- Admin/game-master tools
- Future expansion into native iPhone app

---

# 1. Core Goals

The platform should:
- Minimize manual bookkeeping
- Make the game readable and exciting in real time
- Support strategic play without overwhelming UI
- Work primarily on mobile browsers during travel
- Allow spectators/admins to follow the game

The design should feel:
- fast
- map-centric
- lightweight
- tactical
- readable outdoors on phones

---

# 2. Platforms

## Phase 1
Responsive web app:
- Mobile browsers (primary)
- Desktop/laptop browsers (secondary)

## Phase 2 (future)
Native iPhone app:
- likely React Native or Flutter
- reusing backend/API from web platform

---

# 3. User Roles

## 3.1 Player
Member of a team.
Can:
- view map
- view team state
- claim stations
- reveal/complete challenges
- upload proof photos/videos
- see game timer
- view other teams (limited information)

---

## 3.2 Admin / Game Master
Controls game.
Can:
- create games
- configure rules
- approve disputed challenges
- spawn/edit/remove challenges
- pause game
- adjust chips manually
- view full live information
- override claims

---

## 3.3 Spectator (optional)
Read-only mode.
Can:
- watch live map
- see score
- see claimed stations
- see completed challenges

Potentially delayed by 15–30 min.

---

# 4. Core Gameplay Systems

## 4.1 Teams
- 3 teams
- each team has:
  - name
  - color
  - icon/logo
  - chip balance
  - claimed stations
  - challenge history

Suggested colors:
- red
- blue
- green

---

# 5. Map System

## 5.1 Base Map
Interactive map of Czech Republic.

Preferred technologies:
- Mapbox
- Leaflet
- OpenStreetMap tiles

Map should display:
- railway lines
- stations
- team ownership
- challenges
- team positions (depending on rules)

---

## 5.2 Stations
Every station is clickable.

Station state:
- unclaimed
- owned by Team A/B/C
- contested recently

Displayed info:
- station name
- current chip value
- owner
- claim history
- connected lines

Visual representation:
- colored circles
- chip count visible inside marker

---

## 5.3 Claiming Stations
Players can:
- claim station
- reinforce station
- steal station

Rules:
- must place current value + 1 chips
- max +4 chips per visit

Flow:
1. Player opens station
2. Presses "Claim"
3. Selects chip amount
4. Confirmation dialog
5. Backend validates legality
6. Station updates live

Important:
- station claiming should require GPS proximity OR QR code verification

Recommended anti-cheat:
- GPS within ~200m of station
OR
- physical QR sticker placed at station

---

# 6. Challenge System

## 6.1 Challenge Display
Challenges appear on map.

Visible before reveal:
- location
- type
- reward range

Challenge types:
- Ordinary
- Steal
- Multiplier

Challenge markers should visually differ.

Example:
- ordinary = circle
- steal = lightning icon
- multiplier = star icon

---

## 6.2 Reveal Flow
Challenge details hidden until arrival.

Flow:
1. Team reaches challenge town
2. Opens challenge
3. Presses "Reveal Challenge"
4. Full challenge text appears
5. Team chooses:
   - Attempt
   - Skip

Important:
- once revealed:
  - challenge becomes locked to that team for X minutes
  - other teams see it as "occupied"

This prevents simultaneous farming.

---

## 6.3 Completing Challenges
Challenge completion requires:
- text confirmation
- photo/video upload
- optional admin approval

Possible evidence:
- selfie
- landmark photo
- receipt
- short video
- GPS confirmation

Upon success:
- chips added automatically
- challenge marked completed
- 3 new challenges spawn

Upon failure:
- challenge marked failed for that team
- reward increases by 50% for others

---

# 7. Game Timer

Global game timer visible at all times.

Displays:
- current day
- time remaining
- active phase

Should support:
- pauses
- overnight downtime
- scheduled start/end

---

# 8. Team Visibility Rules

Configurable.

Possible modes:

## Full Visibility
Live team positions visible.

## Delayed Visibility
Locations update every X minutes.

## Claim-Only Visibility
Teams visible only when claiming station.

Recommended default:
Claim-Only Visibility.

---

# 9. Notifications

Players should receive live notifications for:
- station stolen
- challenge completed
- new challenge spawned
- team nearby
- game phase ending

Mobile push notifications later.

Web version:
- browser notifications
- in-app notification feed

---

# 10. Scoreboard

Displays:
- stations owned
- total chips
- completed challenges
- steal statistics
- current leader

Should support:
- live updates
- endgame summary

---

# 11. Admin Dashboard

Critical feature.

Admin should be able to:
- create/edit/delete challenges
- spawn challenges manually
- freeze teams
- transfer chips
- override claims
- approve challenge evidence
- view hidden team locations
- configure rules

Should also include:
- event log
- rollback functionality

---

# 12. Game Configuration

Admin-configurable settings:
- max chips per claim
- starting chips
- challenge spawn count
- challenge reward scaling
- visibility rules
- station decay rules
- GPS radius
- game duration

This allows replayability.

---

# 13. Mobile UX Requirements

Most important requirement.

Players will:
- run through stations
- play outdoors
- use unstable internet
- check map quickly

Therefore:
- large buttons
- low interaction count
- dark mode
- offline tolerance
- fast loading
- minimal text during movement

Critical screens:
- map
- claim station
- reveal challenge
- team chips

Should be accessible within 1–2 taps.

---

# 14. Offline / Weak Connection Support

Important for trains.

App should:
- cache map
- queue actions offline
- retry uploads automatically
- show connection state

Potential approach:
- Progressive Web App (PWA)

---

# 15. Suggested Tech Stack

## Frontend
Recommended:
- React + TypeScript
- Next.js

Map:
- Mapbox GL JS
OR
- Leaflet

Mobile support:
- PWA initially
- React Native later

---

## Backend
Recommended:
- Node.js
- PostgreSQL
- Prisma ORM

Realtime:
- WebSockets
- Supabase realtime
OR
- Firebase

---

## Authentication
Simple initially:
- magic links
- Google login

---

## File Uploads
Needed for challenge proof.

Use:
- Supabase Storage
OR
- AWS S3

---

# 16. Important Features You Forgot

## 16.1 Action Log
VERY important.

Live chronological feed:
- Team Red claimed Pardubice (+3)
- Team Blue revealed challenge in Brno
- Team Green stole Olomouc

This makes the game understandable.

---

## 16.2 Replay System
After game ends:
- replay map movement
- timeline visualization
- station ownership evolution

This becomes one of the coolest features.

---

## 16.3 Challenge Cooldowns
Prevent abuse.

Examples:
- cannot chain reveals instantly
- cannot spam nearby easy challenges

Potential:
- one active challenge per team

---

## 16.4 Nearby Team Alerts
Optional.

If teams enter same station/city:
- alert appears

This encourages interaction.

---

## 16.5 Dispute System
Needed eventually.

Teams can:
- contest challenge validity
- request admin review

---

## 16.6 Station Search
Players need quick station lookup.

Should support:
- autocomplete
- filtering
- ownership highlighting

---

## 16.7 Analytics / Heatmaps
Post-game:
- most contested stations
- busiest routes
- chip economy graphs
- team movement heatmaps

Excellent for replayability.

---

# 17. Recommended MVP Scope

For first playable version:

Must have:
- login
- teams
- map
- station claiming
- challenge reveal/completion
- chip tracking
- realtime updates
- admin panel

Can wait:
- replay system
- spectator mode
- native app
- advanced analytics
- push notifications

---

# 18. Suggested UI Structure

## Mobile Bottom Navigation
- Map
- Challenges
- Team
- Feed
- Rules

---

## Main Map Screen
Should show:
- stations
- claims
- active challenges
- chip balance
- timer

This is the primary gameplay screen.

---

# 19. Future Features

Potential later additions:
- AI-generated challenges
- procedural challenge spawning
- multi-country support
- season templates
- integrated train timetables
- automatic route prediction
- spectator betting/fantasy mode

---

# 20. Design Direction

Visual style should feel:
- transit-inspired
- tactical
- modern
- readable outdoors

References:
- transit apps
- strategy board games
- Jet Lag: The Game overlays
- GeoGuessr UI simplicity

Avoid:
- clutter
- tiny controls
- excessive animations
- overly gamified fantasy style

The map should always remain the focus.

