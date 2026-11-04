import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParTable, parseCourses } from '../src/lib/clubLocator';

// Shaped like a real Overpass response to buildQuery(): the courses the point
// is inside (ids only), a "split" marker, then each course followed by the
// holes mapped within it.
const hole = (ref: string, par?: string, extra: Record<string, string> = {}, center = { lat: 56.35, lon: -2.81 }) => ({
  type: 'way', id: Math.floor(Math.random() * 1e9), center,
  tags: { golf: 'hole', ref, ...(par ? { par } : {}), ...extra },
});
const course = (id: number, name: string, center: { lat: number; lon: number }) => ({
  type: 'way', id, center, tags: { leisure: 'golf_course', name },
});

test('the course the player is inside comes first, with its par per hole', () => {
  const elements = [
    { type: 'way', id: 1 },
    { type: 'split', id: 1 },
    course(2, 'New Course', { lat: 56.354, lon: -2.817 }),
    hole('1', '4'),
    course(1, 'Old Course', { lat: 56.352, lon: -2.814 }),
    hole('1', '4'), hole('5', '5'), hole('8', '3'), hole('9', '4;5'),
  ];
  const courses = parseCourses(elements, 56.3433, -2.8030);
  assert.equal(courses[0].name, 'Old Course');
  assert.equal(courses[0].inside, true);
  assert.equal(courses[0].id, 'osm-way-1');
  assert.deepEqual(courses[0].holePars, { 1: 4, 5: 5, 8: 3, 9: 4 }); // "4;5" -> first tee's par
  assert.equal(courses[1].inside, false);
});

test('one area with several named courses becomes one choice per course', () => {
  const elements = [
    { type: 'split', id: 1 },
    course(7, 'The Belfry', { lat: 52.562, lon: -1.735 }),
    hole('1', '4', { 'golf:course:name': 'Brabazon' }),
    hole('1', '5', { 'golf:course:name': 'Derby' }),
    hole('2', undefined, { 'golf:course:name': 'PGA National' }),
    hole('7', '3'), // unlabelled stray: too few to be a course of its own
  ];
  const names = parseCourses(elements, 52.56, -1.73).map((c) => c.name).sort();
  assert.deepEqual(names, ['The Belfry — Brabazon', 'The Belfry — Derby', 'The Belfry — PGA National']);
});

test('when two holes claim one number, the one nearer the course wins', () => {
  const centre = { lat: 56.35, lon: -2.81 };
  const elements = [
    { type: 'split', id: 1 },
    course(3, 'Links', centre),
    hole('3', '5', {}, { lat: 56.36, lon: -2.83 }), // neighbour's hole crossing the boundary
    hole('3', '3', {}, { lat: 56.3501, lon: -2.8101 }),
  ];
  assert.deepEqual(parseCourses(elements, 56.35, -2.81)[0].holePars, { 3: 3 });
});

test('buildParTable fills from the map and says how many holes it covered', () => {
  const fallback = Array(18).fill(4);
  const full = buildParTable({ 1: 5, 2: 3 }, 9, fallback.slice(0, 9));
  assert.deepEqual(full.pars, [5, 3, 4, 4, 4, 4, 4, 4, 4]);
  assert.equal(full.fromMap, 2);
});

test('a 9-hole course played as 18 goes round twice, ignoring a stray back-nine hole', () => {
  const nine = { 1: 3, 2: 4, 3: 5, 4: 3, 5: 4, 6: 5, 7: 3, 8: 4, 9: 5, 10: 4 };
  const { pars, fromMap } = buildParTable(nine, 18, Array(18).fill(4));
  assert.equal(fromMap, 18);
  assert.deepEqual(pars.slice(9), pars.slice(0, 9));
});
