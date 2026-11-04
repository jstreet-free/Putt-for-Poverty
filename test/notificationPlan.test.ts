import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationState, PlanInput, planNotifications, QUIET_MS, SCORE_PUSH_GAP_MS } from '../api/_lib/notificationPlan';

const START = 1_000_000;
const MIN = 60 * 1000;

const ALEX = { id: 'alex', name: 'Alex', chargeStatus: 'charged' };
const SAM = { id: 'sam', name: 'Sam', chargeStatus: 'charged' };

function input(overrides: Partial<PlanInput>): PlanInput {
  return {
    nowMs: START + MIN,
    startedAtMs: START,
    lobby: { holes: 9 },
    members: [ALEX, SAM],
    cards: [],
    state: null,
    ...overrides,
  };
}

function card(userId: string, updatedAtMs: number, strokes: Record<string, number> = { '1': 3 }) {
  return { userId, strokes, updatedAtMs };
}

function announced(userId: string, sentAtMs: number, lastChangeMs = sentAtMs): NotificationState {
  return { players: { [userId]: { strokes: '1:3', sentAtMs, lastChangeMs, remindedForMs: null } } };
}

test('a new score is announced with the score to par', () => {
  const plan = planNotifications(input({ cards: [card('alex', START + 30_000)] }));
  assert.deepEqual(plan.scores, [{ userId: 'alex', body: 'Alex is -1 thru 1' }]);
  assert.equal(plan.state.players.alex.lastChangeMs, START + 30_000);
  assert.equal(plan.stateChanged, true);
});

test('finishing the last hole reads as a finish', () => {
  const strokes = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 4]));
  const plan = planNotifications(input({ cards: [card('alex', START + 30_000, strokes)] }));
  assert.equal(plan.scores[0].body, 'Alex finished at E');
});

test("a player on their own par is scored on it", () => {
  const pars = [3, 4, 4, 4, 4, 4, 4, 4, 4];
  const plan = planNotifications(input({
    members: [{ ...ALEX, pars }, SAM],
    cards: [card('alex', START + 30_000)],
  }));
  assert.equal(plan.scores[0].body, 'Alex is E thru 1');
});

test('re-saving the same strokes announces nothing and does not reset the quiet timer', () => {
  // Scorecard saves on open, which moves updatedAt without changing a score.
  const state = announced('alex', START + MIN);
  const plan = planNotifications(input({
    nowMs: START + MIN + QUIET_MS,
    cards: [card('alex', START + MIN + QUIET_MS - 1000)],
    state,
  }));
  assert.deepEqual(plan.scores, []);
  assert.equal(plan.state.players.alex.lastChangeMs, START + MIN);
  assert.deepEqual(plan.reminders, ['alex', 'sam']);
});

test('opening an empty scorecard announces nothing', () => {
  const plan = planNotifications(input({ cards: [card('alex', START + 30_000, {})] }));
  assert.deepEqual(plan.scores, []);
  assert.equal(plan.stateChanged, false);
});

test('swapping strokes between holes counts as a change even though the total stays put', () => {
  const state: NotificationState = {
    players: { alex: { strokes: '1:3,2:5', sentAtMs: START, lastChangeMs: START, remindedForMs: null } },
  };
  const plan = planNotifications(input({
    nowMs: START + 5 * MIN,
    cards: [card('alex', START + 5 * MIN, { '1': 5, '2': 3 })],
    state,
  }));
  assert.equal(plan.scores.length, 1);
});

test('the order strokes come back in does not count as a change', () => {
  const state: NotificationState = {
    players: { alex: { strokes: '1:3,2:5', sentAtMs: START, lastChangeMs: START, remindedForMs: null } },
  };
  const plan = planNotifications(input({ cards: [card('alex', START + 30_000, { '2': 5, '1': 3 })], state }));
  assert.deepEqual(plan.scores, []);
});

test('a correction inside the gap waits, then goes out as the latest score', () => {
  const state = announced('alex', START + MIN);
  const correction = card('alex', START + MIN + 5000, { '1': 4 });

  const early = planNotifications(input({ nowMs: START + MIN + 10_000, cards: [correction], state }));
  assert.deepEqual(early.scores, []);
  assert.equal(early.state.players.alex.lastChangeMs, START + MIN + 5000);
  assert.equal(early.state.players.alex.strokes, '1:3');

  const later = planNotifications(input({
    nowMs: START + MIN + SCORE_PUSH_GAP_MS,
    cards: [correction],
    state: early.state,
  }));
  assert.deepEqual(later.scores, [{ userId: 'alex', body: 'Alex is E thru 1' }]);
});

test('running twice in a row announces once', () => {
  const cards = [card('alex', START + 30_000)];
  const first = planNotifications(input({ cards }));
  const second = planNotifications(input({ nowMs: START + 2 * MIN, cards, state: first.state }));
  assert.equal(first.scores.length, 1);
  assert.deepEqual(second.scores, []);
  assert.equal(second.stateChanged, false);
});

test('a player is reminded after the full quiet period on their own card', () => {
  const cards = [card('alex', START + 2 * MIN)];
  const state = announced('alex', START + 2 * MIN);
  const members = [ALEX];
  assert.deepEqual(planNotifications(input({ nowMs: START + 2 * MIN + QUIET_MS - 1, members, cards, state })).reminders, []);
  assert.deepEqual(planNotifications(input({ nowMs: START + 2 * MIN + QUIET_MS, members, cards, state })).reminders, ['alex']);
});

test('only the player who has fallen quiet is reminded', () => {
  const justScored = START + QUIET_MS - MIN;
  const plan = planNotifications(input({
    nowMs: START + QUIET_MS,
    cards: [card('alex', justScored)],
    state: {
      players: {
        alex: { strokes: '', sentAtMs: 0, lastChangeMs: START, remindedForMs: null },
        sam: { strokes: '1:4', sentAtMs: START, lastChangeMs: START, remindedForMs: null },
      },
    },
  }));
  assert.deepEqual(plan.reminders, ['sam']);
});

test("another player's scores don't hold back a reminder", () => {
  // The whole point: Sam can't hide behind Alex keeping up.
  const first = planNotifications(input({ cards: [card('alex', START + 30_000)] }));
  const plan = planNotifications(input({
    nowMs: START + QUIET_MS,
    cards: [card('alex', START + QUIET_MS - 1000, { '1': 3, '2': 4 })],
    state: first.state,
  }));
  assert.deepEqual(plan.reminders, ['sam']);
});

test('spectators are never reminded', () => {
  const spectator = { id: 'pat', name: 'Pat', chargeStatus: 'insufficient_credit' };
  const plan = planNotifications(input({ nowMs: START + 2 * QUIET_MS, members: [ALEX, spectator] }));
  assert.deepEqual(plan.reminders, ['alex']);
});

test('with no scores yet, the quiet period runs from the start of the event', () => {
  assert.deepEqual(planNotifications(input({ nowMs: START + QUIET_MS - 1 })).reminders, []);
  assert.deepEqual(planNotifications(input({ nowMs: START + QUIET_MS })).reminders, ['alex', 'sam']);
});

test('a late joiner gets the full quiet period from when they joined', () => {
  const joined = START + 2 * QUIET_MS;
  const members = [{ ...ALEX, chargedAtMs: joined }];
  assert.deepEqual(planNotifications(input({ nowMs: joined + 1000, members })).reminders, []);
  assert.deepEqual(planNotifications(input({ nowMs: joined + QUIET_MS, members })).reminders, ['alex']);
});

test('one reminder per quiet spell, until a new score starts another', () => {
  const members = [ALEX];
  const first = planNotifications(input({ nowMs: START + QUIET_MS, members }));
  assert.deepEqual(first.reminders, ['alex']);

  const stillQuiet = planNotifications(input({ nowMs: START + 3 * QUIET_MS, members, state: first.state }));
  assert.deepEqual(stillQuiet.reminders, []);

  const scored = START + 3 * QUIET_MS;
  const cards = [card('alex', scored)];
  const next = planNotifications(input({ nowMs: scored + 1000, members, cards, state: stillQuiet.state }));
  assert.deepEqual(next.reminders, []);
  assert.equal(next.scores.length, 1);

  const quietAgain = planNotifications(input({ nowMs: scored + QUIET_MS, members, cards, state: next.state }));
  assert.deepEqual(quietAgain.reminders, ['alex']);
});

test('no reminder while their held correction is waiting to go out', () => {
  const plan = planNotifications(input({
    nowMs: START + QUIET_MS,
    members: [ALEX],
    cards: [card('alex', START + QUIET_MS - 1000, { '1': 4 })],
    state: announced('alex', START + QUIET_MS - 5000, START),
  }));
  assert.deepEqual(plan.scores, []);
  assert.deepEqual(plan.reminders, []);
});

test('a player who has finished is not reminded, even if others are still out', () => {
  const strokes = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 4]));
  const plan = planNotifications(input({ nowMs: START + 2 * QUIET_MS, cards: [card('alex', START, strokes)] }));
  assert.deepEqual(plan.reminders, ['sam']);
});

test('a card with no matching member is ignored', () => {
  const plan = planNotifications(input({ cards: [card('stranger', START + 30_000)] }));
  assert.deepEqual(plan.scores, []);
});
