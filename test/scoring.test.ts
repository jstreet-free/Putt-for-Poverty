import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankScorecards, tallyStrokes, getPars, validatePars, Tally } from '../api/_lib/scoring';

const PAR4_9 = Array.from({ length: 9 }, () => 4);

function card(name: string, strokes: number[], pars = PAR4_9): Tally {
  const map: Record<string, number> = {};
  strokes.forEach((s, i) => { map[String(i + 1)] = s; });
  const t = tallyStrokes(map, pars, 9);
  return { userId: name.toLowerCase(), name, ...t };
}

test('final: lowest score to par wins', () => {
  const pars = [3, 5, 3, 5, 3, 5, 3, 5, 3]; // par 35
  const even = card('Carl', [3, 5, 3, 5, 3, 5, 3, 5, 3], pars); // 35 strokes -> E
  const over = card('Alice', [4, 4, 4, 4, 4, 4, 4, 4, 4], pars); // 36 strokes -> +1
  const rows = rankScorecards([over, even], 9, 'final');
  assert.equal(rows[0].name, 'Carl');
  assert.equal(rows[0].toPar, 0);
  assert.equal(rows[0].position, 1);
  assert.equal(rows[1].toPar, 1);
});

test('live: a lower raw total does not beat a better score to par', () => {
  const pars = [3, 5, 3, 5, 3, 5, 3, 5, 3]; // par 35
  // Dana: thru 4 holes (par 16), 17 strokes -> +1, but a smaller raw total.
  const dana = card('Dana', [3, 5, 3, 6], pars);
  // Erin: all 9 holes, 35 strokes -> E. Bigger raw total, better score to par.
  const erin = card('Erin', [3, 5, 3, 5, 3, 5, 3, 5, 3], pars);
  const rows = rankScorecards([dana, erin], 9, 'live');
  assert.equal(dana.total < erin.total, true);
  assert.equal(rows[0].name, 'Erin');
  assert.equal(rows[0].toPar, 0);
  assert.equal(rows[1].name, 'Dana');
  assert.equal(rows[1].toPar, 1);
});

test('ties share a position (T2, T2, 4)', () => {
  const pars = PAR4_9;
  const rows = rankScorecards([
    card('A', [3, 4, 4, 4, 4, 4, 4, 4, 4], pars), // -1
    card('B', [4, 4, 4, 4, 4, 4, 4, 4, 5], pars), // +1
    card('C', [4, 4, 4, 4, 4, 4, 4, 4, 5], pars), // +1
    card('D', [5, 4, 4, 4, 4, 4, 4, 4, 4], pars), // +1  -> three at +1
    card('E', [5, 5, 4, 4, 4, 4, 4, 4, 4], pars), // +2
  ], 9, 'final');
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 2, 2, 5]);
});

test('final: an unfinished card is a DNF with no place, below every finisher', () => {
  const pars = PAR4_9;
  const finisher = card('Finisher', [5, 5, 5, 5, 5, 5, 5, 5, 5], pars); // +9
  const partial = card('Partial', [3, 3, 3, 3], pars);                  // -4 but only 4 holes
  const rows = rankScorecards([partial, finisher], 9, 'final');
  assert.equal(rows[0].name, 'Finisher');
  assert.equal(rows[0].position, 1);
  assert.equal(rows[1].name, 'Partial');
  assert.equal(rows[1].status, 'dnf');
  assert.equal(rows[1].position, null);
});

test('live: a player mid-round is ranked on score to par so far, not on holes played', () => {
  const pars = PAR4_9;
  const midRound = card('Mid', [3, 3, 3, 3], pars);   // thru 4, -4
  const finished = card('Done', [4, 4, 4, 4, 4, 4, 4, 4, 4], pars); // thru 9, E
  const rows = rankScorecards([finished, midRound], 9, 'live');
  assert.equal(rows[0].name, 'Mid');
  assert.equal(rows[0].status, 'playing');
  assert.equal(rows[0].position, 1);
});

test('not-started players sit at the bottom with no place', () => {
  const pars = PAR4_9;
  const rows = rankScorecards([
    { userId: 'x', name: 'Idle', total: 0, parPlayed: 0, holesPlayed: 0 },
    card('Played', [4, 4, 4, 4, 4, 4, 4, 4, 4], pars),
  ], 9, 'live');
  assert.equal(rows[0].name, 'Played');
  assert.equal(rows[1].name, 'Idle');
  assert.equal(rows[1].status, 'not_started');
  assert.equal(rows[1].position, null);
});

test('par is compared per hole played, so a par-5 hole counts as 5', () => {
  const pars = [5, 3, 4, 4, 4, 4, 4, 4, 4];
  const t = tallyStrokes({ '1': 6, '2': 3 }, pars, 9);
  assert.equal(t.total, 9);
  assert.equal(t.parPlayed, 8); // 5 + 3
  assert.equal(t.holesPlayed, 2);
});

test('out-of-range strokes are ignored rather than skewing the total', () => {
  const t = tallyStrokes({ '1': 4, '2': 99, '12': 4, '3': 0 }, PAR4_9, 9);
  assert.equal(t.holesPlayed, 1);
  assert.equal(t.total, 4);
});

test('getPars defaults to par 4 on every hole and handles legacy lobbies', () => {
  assert.deepEqual(getPars({ holes: 9 }), PAR4_9);
  assert.deepEqual(getPars({ holes: 9, pars: [3, 3, 3, 3, 3, 3, 3, 3, 3] }), Array(9).fill(3));
  assert.equal(getPars({ holes: 18 }).length, 18);
});

test('validatePars rejects wrong length and out-of-range values', () => {
  assert.equal(validatePars(PAR4_9, 9), null);
  assert.ok(validatePars([4, 4], 9));
  assert.ok(validatePars([4, 4, 4, 4, 4, 4, 4, 4, 9], 9));
  assert.ok(validatePars([4, 4, 4, 4, 4, 4, 4, 4, 4.5], 9));
});
