# Lobbies

Scheduled meetups where a small group of paid-up players compete over a
round, see each other's live position during it, and get a permanent
scorecard afterwards. This doc covers the lifecycle, the data model, the
server endpoints, and how to deploy/run this piece.

## Lifecycle

```
scheduled --(host presses Start, 15min before .. 12h after eventDate)--> live
scheduled --(nobody ever starts it, 12h after eventDate)--> expired
live      --(host presses Finish, or 12h after startedAt)--> finished
finished / expired --(7 days later)--> deleted (history already copied out)
```

A lobby only ever moves forward through this chain, never back. Every
transition — and every write to `status`, `startedAt`, `finishedAt`,
`expiresAt`, a member's `chargeStatus`, a `results` doc, or a
`users/{uid}/history` entry — happens **server-side**, via `firebase-admin`
in one of the `/api/*-lobby.ts` endpoints. `firestore.rules` sets all of
those to `create/update/write: false` for clients; the rules exist to
validate everything else (rosters, invite codes, live-event reads/writes,
the handful of details a host can still edit before start).

**Credits are charged once, at Start, atomically.** Not on join, not on a
schedule. This is what stops one credit paying for many lobbies (enforced by
the "one active lobby" rule below) and what stops a double-charge if
something fails partway (the whole charge-and-transition is one Firestore
transaction — either every member gets resolved and the lobby goes live, or
none of it happens).

**The one exception is joining a lobby that's already live.** Start has
already run, so `join-lobby` charges the late joiner itself, in the same
transaction that writes their member doc (`chargeStatus: 'charged'`).
Joining needs an available credit anyway, so a late joiner is never a
spectator. A lobby stays joinable, scheduled or live, until its `expiresAt`.

**A user may be in only one lobby with status `scheduled` or `live` at a
time.** `api/_lib/lobbies.ts`'s `getActiveLobbyId()` enforces this on both
create and join by reading the user's own membership index
(`users/{uid}/lobbyMemberships`) — cheap, and doesn't need a Firestore index
of its own.

**A member without a credit at Start isn't removed — they become a
spectator.** Their member doc gets `chargeStatus: 'insufficient_credit'` (or
`'no_participant_record'` if they have no participant doc at all). A
spectator can watch the map and leaderboard for that lobby but the rules
block them from writing a scorecard or sharing location
(`isChargedMember()` in `firestore.rules`).

## Data model

| Path | Written by | Notes |
|---|---|---|
| `lobbies/{id}` | server (create/start/finish/maintenance/set-pars); client (host editing `name`/`isClosed`/`eventDate` while `scheduled`) | `status`, `holes`, `pars`, `club`, `expiresAt`, `startedAt`, `finishedAt` |
| `lobbies/{id}/secret/join` | client (host, only while `scheduled`) | invite code for closed lobbies; only the creator/admin can ever read it back |
| `lobbies/{id}/members/{uid}` | server (join/add/create/set-pars); client can `delete` only (leave/kick, only while `scheduled`) | `chargeStatus` set at Start, or at join for a late joiner; `pars`/`club` only if the player set their own par |
| `lobbies/{id}/locations/{uid}` | client (the player themself, only while `live` and charged) | live GPS, rounded to ~1m, one write per 15s/10m of movement |
| `lobbies/{id}/scorecards/{uid}` | client (the player themself, only while `live` and charged) | raw per-hole strokes; `total`/`holesPlayed` recomputed authoritatively server-side at Finish, never trusted from the client |
| `lobbies/{id}/results/final` | server (Finish) | the archived, ranked standings |
| `lobbies/{id}/notifications/state` | server (`lobby-notifications`) | per player: what was last announced, when their score last changed, which quiet spell was already reminded about |
| `users/{uid}/lobbyMemberships/{lobbyId}` | server (create/join); client can `delete` only | index used to find "my active lobby" without a collection-group query |
| `users/{uid}/history/{lobbyId}` | server (Finish) | one entry per member per finished lobby, including spectators (`myPosition`/`myTotal: null`) — this is what survives lobby deletion |
| `pushTokens/{fcmToken}` | client (write only, under their own uid); read by the server | one doc per device, owned by whoever signed in on it last |

**Scoring is stroke play to par, like a normal tournament.** Each hole has a
par (default 4; the host can set each hole's par when creating the lobby and
change it during the event). A player's score is their strokes minus the par
of the holes they've played, so the leaderboard shows `-3`, `E`, `+5`. The
lowest score to par wins, and tied players share a position (`T2`).

**Each player can have their own par.** Players in one event may be at
different clubs, so the lobby's `pars` is only the *event* par — what anyone
without their own plays to. A player can set their own on their member doc
(`pars` + `club`), which only changes their card; they're scored on it live
and at Finish (`getPlayerPars()`), and the leaderboard shows the club and par
next to their name so it's visible to everyone. Who can change what (all via
`set-lobby-pars`, while `scheduled` or `live`):

- **The player** — their own par, or drop it to go back to the event's.
- **The host** — the event par. Players on their own par keep it.
- **An admin** — any player's par, and **Apply to everyone**, which sets the
  event par and clears every player's own in one batch. The admin panel
  ("Players' par") shows on the lobby whether or not the admin is playing.

**Finding the club from the player's location.** `src/lib/clubLocator.ts`
takes the browser's position and asks OpenStreetMap's Overpass API (one
request, with a mirror as fallback) for the `leisure=golf_course` areas the
player is inside or within 1.5 km of, plus each course's `golf=hole` ways
(`ref` = hole number, `par`). A resort mapped as one area with several
courses is split by the holes' `golf:course:name`. The course's par fills
the editor; holes the map has no par for keep the current value, and the UI
says how many holes came from the map, because coverage varies (e.g. St
Andrews' Old Course and the Belfry's Brabazon are fully mapped, while the
Belfry's PGA National has its holes but no pars). During a live event the
player's panel looks the club up on its own and, if its par differs from
theirs, offers it in one tap. It's never applied silently, because their
score to par would jump mid-round. The host gets the same "Find my club"
button for the event par, including when creating a lobby.

- **Live:** everyone who has started is ranked on score to par so far, with
  "thru N" alongside. Players who haven't started sit at the bottom with no
  place.
- **Final:** a player who completed every hole is ranked. A player who didn't
  is a **DNF** and has no place, listed below everyone who finished.

The logic is `rankScorecards()`, `tallyStrokes()` and `getPlayerPars()`, duplicated in
`src/lib/lobbyScoring.ts` (client) and `api/_lib/scoring.ts` (server). Keep the
two identical. `test/scoring.test.ts` pins the behavior down (run with
`node --import tsx --test test/scoring.test.ts`; `test/clubLocator.test.ts`
covers reading courses and pars out of an Overpass response, and
`test/notificationPlan.test.ts` covers which pushes are due). Stableford would
be a change to `rankScorecards()` alone.

## Server endpoints (`/api`)

All POST, all require `Authorization: Bearer <Firebase ID token>` (the
client sends this via `src/lib/lobbyApi.ts`), all return `{ error }` JSON on
failure with a real status code.

- **`create-lobby`** — validates the request, the caller's credit, and that
  they have no other active lobby; writes the lobby + creator's member doc +
  membership index entry (+ invite code if closed) in one batch.
- **`join-lobby`** — same validation, plus the invite code check for closed
  lobbies; no-ops (200) if already a member. Works while `scheduled` or
  `live` (until `expiresAt`); joining a `live` lobby charges the credit
  immediately, in one transaction with the member write.
- **`add-lobby-member`** — the host (or an admin) adds a registered player
  directly, no invite code. Shares `addPlayerToLobby()` in
  `api/_lib/lobbies.ts` with `join-lobby`, so the player still needs their
  own available credit and no other active lobby, and is charged at once if
  the lobby is `live`.
- **`set-lobby-pars`** — every par change, by `target`: `'event'` (host or
  admin), `'player'` (that player, or an admin; `pars: null` drops it) and
  `'everyone'` (admin only). An optional `club` (`{ id, name }`) records
  which course the par came from.
- **`start-lobby`** — one Firestore transaction: reads the lobby, every
  member, and every member's participant doc; charges (`usedRounds +1`) or
  marks each member; flips the lobby to `live`. Only the host or an admin,
  and only inside the 15-min-before .. 12h-after window.
- **`finish-lobby`** — one transaction: recomputes every charged member's
  score from raw strokes, ranks them, writes `results/final` and a
  `history` entry per member, flips the lobby to `finished`. Exported as a
  plain function too (`finishLobby()`) so `lobby-maintenance` can call it
  directly. Callable by the host/admin any time, or by **any member** once
  `expiresAt` has passed — this is the client-side fallback for a live event
  nobody wrapped up (see below).
- **`delete-lobby`** — host (only while `scheduled`) or admin; cleans up
  every member's membership-index entry before recursively deleting the
  lobby.
- **`lobby-notifications`** — sends whatever pushes are due (see
  [Push notifications](#push-notifications)). Takes `CRON_SECRET` for every
  live lobby, or a member's ID token plus `lobbyId` for just that lobby.
- **`lobby-maintenance`** — the catch-up job: expires `scheduled` lobbies
  whose window ran out, finishes `live` lobbies whose window ran out, and
  deletes `finished`/`expired` lobbies past their 7-day cleanup deadline.
  Runs once a day via Vercel Cron (`vercel.json`) against `CRON_SECRET`, and
  has a "Run Maintenance Now" button in the Admin panel for admins.

## Push notifications

Two pushes, both only while a lobby is `live`:

- **Score update.** When a player's strokes change, everyone else in the
  lobby gets "Alex is -2 thru 7" (or "Alex finished at -2").
- **Reminder.** A charged player whose own score hasn't changed for 15 minutes
  gets a nudge to enter it. A hole takes about 13 minutes, so a player keeping
  up never sees one. It goes out once per quiet spell and their next real score
  starts a new one. Before their first score, the spell runs from the start of
  the event, or from when they joined if they joined late. Spectators never get
  one, and neither does a player who has finished. Spectators do still get
  score updates.

Both come from `processLobby()` in `api/_lib/lobbyNotifications.ts`, which has
two callers:

1. **The player's phone**, about 4 seconds after they stop changing a score,
   so score pushes go out right away.
2. **A scheduler, every minute.** This is what notices silence, since nothing
   happens on any phone when nobody does anything. It also sends any score
   push a phone didn't get to, for example if it locked first.

Change `QUIET_MS` in `api/_lib/notificationPlan.ts` to adjust the 15 minutes.

**What counts as a change.** Strokes are compared with what was last
announced; `updatedAt` alone means nothing, because `Scorecard` re-saves the
card whenever it opens. A second change from the same player within 30 seconds
(`SCORE_PUSH_GAP_MS`) waits for a later run, so a correction doesn't buzz
everyone twice. The state is updated in a transaction before sending, so
overlapping runs can't send a push twice, but a send that fails isn't retried.

**On the phone.** Messages are data-only, and `public/sw.js` is the only thing
that shows them. It must show one for every message, or iOS drops the
subscription. The sound is the phone's default notification sound: web push
can't set a custom one, and a phone on silent or Do Not Disturb stays quiet.
Players opt in on the lobby page (`PushPrompt`), and iPhones only offer web
push (iOS 16.4+) to a site added to the Home Screen, which the prompt explains.
Installed from there the app has its own sign-in, separate from Safari's.

**Setup:**

1. `firebase deploy --only firestore:rules` (for `pushTokens`).
2. In the Firebase console, go to Project settings > Cloud Messaging > Web
   Push certificates and generate a key pair. Set the public key as
   `VITE_FIREBASE_VAPID_KEY` on Vercel and redeploy.
3. Create a free job on [cron-job.org](https://cron-job.org): `GET
   https://<your-domain>/api/lobby-notifications`, every minute, with the
   header `Authorization: Bearer <CRON_SECRET>`. A healthy run returns
   `{"lobbies":0,"errors":[]}`.

The scheduler has to be external because Vercel's free tier rejects cron jobs
that run more than once a day, so this can't go in `vercel.json` unless the
project moves to a paid plan. Without it, score pushes still work but quiet
reminders never fire. A run reads about two documents per member per live
lobby, and one read when nothing is live.

Vercel's free tier allows 12 functions and `/api` now has exactly 12, which is
why both callers share one endpoint. A 13th fails the deployment.

## Deploying

```
firebase deploy --only firestore:rules,firestore:indexes
```

Composite indexes live in `firestore.indexes.json` (two, both on `lobbies`:
`status`+`expiresAt` for maintenance's queries, `status`+`eventDate` for the
lobby list). If you add a new query shape and Firestore complains, it gives
you a console link that writes the index for you — copy it into
`firestore.indexes.json` afterwards so it's tracked and redeployed
automatically next time, rather than only living in the console.

Storage rules (`storage.rules`) are unrelated to this feature but live in
the same `firebase.json` now — deploy with
`firebase deploy --only firestore:rules,firestore:indexes,storage:rules` if
you've also changed those.

**Env vars:** `CRON_SECRET` (Vercel) authorizes the daily
`lobby-maintenance` cron call — set it in your Vercel project and it's sent
automatically as `Authorization: Bearer $CRON_SECRET` by Vercel Cron.
Without it, maintenance still runs when an admin clicks the manual button.
The notification scheduler uses the same secret, but it has to be entered in
the scheduler by hand. `VITE_FIREBASE_VAPID_KEY` is covered under
[Push notifications](#push-notifications).

## Running the rules tests

`test/firestore-rules.test.mjs` uses `@firebase/rules-unit-testing` against
a real Firestore emulator (Node's built-in test runner — no new framework
dependency). One command runs both:

```
npx firebase-tools emulators:exec --only firestore "node --test test/firestore-rules.test.mjs"
```

Covers (among others): a member can't leave a live lobby, a non-member can't
read another lobby's locations, a spectator can't write a scorecard, a
client can't set `status` or a lobby directly, a client can't change
`usedRounds`. Each negative case has a positive control next to it (e.g. "a
charged member CAN write a scorecard") so a rule that's accidentally too
strict fails just as loudly as one that's too permissive.

## The once-a-day cron gap, and how it's covered

Vercel's free tier only runs cron jobs once a day, so `lobby-maintenance`
alone could leave a `live` lobby unfinished (or a `scheduled` one
un-expired) for up to 24h. Three things cover that gap without needing a
paid cron:

1. `finish-lobby`'s auth check lets **any member** (not just the host)
   trigger it once `expiresAt` has passed.
2. The Lobbies page's detail modal calls that automatically the moment
   anyone opens a `live` lobby past its `expiresAt` — see the
   `autoFinishTried` effect in `src/pages/Lobbies.tsx`.
3. The same modal shows a plain "this lobby's window has passed" state for a
   `scheduled` lobby past its `expiresAt`, rather than waiting for
   maintenance to relabel it `expired`.

So in practice a stale lobby self-heals the next time anyone looks at it,
and the cron is a backstop for lobbies nobody ever opens again.

## Manual test checklist

1. Create a lobby (try both open and private/with holes 9 and 18).
2. On a second account, join it (with the share code, for a private one).
3. On the second account, try to create or join a *different* lobby — should
   be blocked with "You're already in an active lobby."
4. As the host, press Start (only enabled inside the window) — confirm both
   accounts' credits (`participants.usedRounds`) went up by one.
5. Enter strokes on both accounts; confirm each sees the other's live
   position on the map and both show up correctly ranked on the leaderboard.
6. Press Finish — confirm the modal shows final standings, and check
   **My Rounds** on both accounts.
7. Confirm the lobby has disappeared from the main `/lobbies` list.
8. With a phone on each account and alerts turned on (screen locked), enter a
   score on one: the other should buzz within a few seconds and the scorer's
   shouldn't. Then enter nothing: each should buzz once, 15-16 minutes after
   their own last score.
