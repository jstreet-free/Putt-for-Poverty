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
| `lobbies/{id}` | server (create/start/finish/maintenance); client (host editing `name`/`isClosed`/`eventDate` while `scheduled`) | `status`, `holes`, `expiresAt`, `startedAt`, `finishedAt` |
| `lobbies/{id}/secret/join` | client (host, only while `scheduled`) | invite code for closed lobbies; only the creator/admin can ever read it back |
| `lobbies/{id}/members/{uid}` | server (join/create); client can `delete` only (leave/kick, only while `scheduled`) | `chargeStatus` set at Start |
| `lobbies/{id}/locations/{uid}` | client (the player themself, only while `live` and charged) | live GPS, rounded to ~1m, one write per 15s/10m of movement |
| `lobbies/{id}/scorecards/{uid}` | client (the player themself, only while `live` and charged) | raw per-hole strokes; `total`/`holesPlayed` recomputed authoritatively server-side at Finish, never trusted from the client |
| `lobbies/{id}/results/final` | server (Finish) | the archived, ranked standings |
| `users/{uid}/lobbyMemberships/{lobbyId}` | server (create/join); client can `delete` only | index used to find "my active lobby" without a collection-group query |
| `users/{uid}/history/{lobbyId}` | server (Finish) | one entry per member per finished lobby, including spectators (`myPosition`/`myTotal: null`) — this is what survives lobby deletion |

Ranking (`rankScorecards()`, duplicated in `src/lib/lobbyScoring.ts` for the
client and `api/_lib/scoring.ts` for the server — keep both in sync) sorts by
holes played (desc), then total strokes (asc), then name; ties share a
position. It's the one place that logic lives, so swapping in a different
scoring format later (Stableford, handicap-adjusted) only means changing
this function.

## Server endpoints (`/api`)

All POST, all require `Authorization: Bearer <Firebase ID token>` (the
client sends this via `src/lib/lobbyApi.ts`), all return `{ error }` JSON on
failure with a real status code.

- **`create-lobby`** — validates the request, the caller's credit, and that
  they have no other active lobby; writes the lobby + creator's member doc +
  membership index entry (+ invite code if closed) in one batch.
- **`join-lobby`** — same validation, plus the invite code check for closed
  lobbies; no-ops (200) if already a member.
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
- **`lobby-maintenance`** — the catch-up job: expires `scheduled` lobbies
  whose window ran out, finishes `live` lobbies whose window ran out, and
  deletes `finished`/`expired` lobbies past their 7-day cleanup deadline.
  Runs once a day via Vercel Cron (`vercel.json`) against `CRON_SECRET`, and
  has a "Run Maintenance Now" button in the Admin panel for admins.

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
