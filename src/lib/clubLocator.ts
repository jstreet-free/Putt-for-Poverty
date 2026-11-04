import { ClubRef } from '../types';
import { DEFAULT_PAR, MAX_PAR, MIN_PAR } from './lobbyScoring';

// Works out which golf course a player is standing on, and its par per hole,
// from OpenStreetMap (the same map data the app's geocoding already uses).
// Courses are `leisure=golf_course` areas; their holes are `golf=hole` ways
// tagged with `ref` (hole number) and `par`. Coverage is good for well-known
// courses and patchy elsewhere, so a result always says how many holes the
// map actually had a par for, and the player fills in or corrects the rest.

export interface DetectedCourse extends ClubRef {
  inside: boolean;   // the player is within the course boundary, not just near it
  distanceM: number; // from the player to the course's centre
  holePars: Record<number, number>; // hole number -> par, only holes the map has a par for
}

export class ClubLookupError extends Error {
  constructor(public reason: 'unsupported' | 'denied' | 'position' | 'lookup', message: string) {
    super(message);
  }
}

// The main Overpass instance is often busy; the mirror serves the same data.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
export const SEARCH_RADIUS_M = 1500;
const REQUEST_TIMEOUT_MS = 20_000;

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new ClubLookupError('unsupported', "This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err.code === err.PERMISSION_DENIED
        ? new ClubLookupError('denied', 'Location access is off. Allow it in your browser to find your club.')
        : new ClubLookupError('position', "Couldn't get your location. Try again in a moment.")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 }
    );
  });
}

// One request: the courses the point is inside (listed first, before a
// "split" marker) and near, each followed by the holes mapped within it.
export function buildQuery(lat: number, lng: number): string {
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `[out:json][timeout:25];
is_in(${at})->.here;
(way(pivot.here)["leisure"="golf_course"];relation(pivot.here)["leisure"="golf_course"];)->.inside;
(way["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${at});relation["leisure"="golf_course"](around:${SEARCH_RADIUS_M},${at});)->.near;
.inside out ids;
make split;out;
(.inside;.near;)->.courses;
foreach.courses->.c(
  .c out tags center;
  .c map_to_area->.a;
  way["golf"="hole"](area.a);
  out tags center;
);`;
}

async function runOverpass(query: string): Promise<any[]> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // A query that ran out of time still comes back as a 200, with a remark.
      if (!Array.isArray(json?.elements) || /error|timed out/i.test(json.remark || '')) {
        throw new Error(json?.remark || 'Unexpected response');
      }
      return json.elements;
    } catch (err) {
      console.warn(`Course lookup via ${endpoint} failed:`, err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ClubLookupError('lookup', "Couldn't reach the course map right now. Try again in a minute.");
}

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// A hole's `ref` may cover two holes ("1;10" on a 9-hole course played
// twice) and its `par` may list several tees ("4;5") — the first is used.
// A hole line that strays into a neighbouring course gets picked up by that
// course too, so when two holes claim the same number, the one nearer the
// course's centre wins.
function holeParsOf(holes: any[], centre?: { lat: number; lon: number }): Record<number, number> {
  const best = new Map<number, { par: number; dist: number }>();
  for (const hole of holes) {
    const par = parseInt(String(hole.tags.par ?? ''), 10);
    if (!Number.isInteger(par) || par < MIN_PAR || par > MAX_PAR) continue;
    const dist = hole.center && centre ? distanceM(hole.center, centre) : 0;
    for (const part of String(hole.tags.ref ?? '').split(';')) {
      const ref = parseInt(part.trim(), 10);
      if (!Number.isInteger(ref) || ref < 1 || ref > 36) continue;
      const prev = best.get(ref);
      if (!prev || dist < prev.dist) best.set(ref, { par, dist });
    }
  }
  return Object.fromEntries([...best].map(([ref, v]) => [ref, v.par]));
}

export function parseCourses(elements: any[], lat: number, lng: number): DetectedCourse[] {
  const splitAt = elements.findIndex((el) => el.type === 'split');
  const insideKeys = new Set(elements.slice(0, Math.max(splitAt, 0)).map((el) => `${el.type}-${el.id}`));

  // Each course element is followed by the holes found inside it.
  const venues: { key: string; tags: Record<string, string>; center?: { lat: number; lon: number }; holes: any[] }[] = [];
  for (const el of elements.slice(splitAt + 1)) {
    if (el.tags?.leisure === 'golf_course') {
      venues.push({ key: `${el.type}-${el.id}`, tags: el.tags, center: el.center, holes: [] });
    } else if (el.tags?.golf === 'hole' && venues.length > 0) {
      venues[venues.length - 1].holes.push(el);
    }
  }

  const here = { lat, lon: lng };
  const courses: DetectedCourse[] = [];
  for (const venue of venues) {
    const venueName = venue.tags.name || venue.tags['name:en'] || 'Unnamed golf course';
    const base = {
      inside: insideKeys.has(venue.key),
      distanceM: venue.center ? Math.round(distanceM(here, venue.center)) : 0,
    };

    // One area can hold several courses (e.g. a 54-hole resort), told apart
    // by the holes' golf:course:name. With fewer than two, it's one course.
    const groups = new Map<string, any[]>();
    for (const hole of venue.holes) {
      const sub = String(hole.tags['golf:course:name'] || '').trim();
      groups.set(sub, [...(groups.get(sub) || []), hole]);
    }
    const named = [...groups.keys()].filter(Boolean);

    if (named.length < 2) {
      courses.push({ id: `osm-${venue.key}`, name: venueName, ...base, holePars: holeParsOf(venue.holes, venue.center) });
      continue;
    }
    for (const sub of named) {
      courses.push({
        id: `osm-${venue.key}-${slug(sub)}`,
        name: sub.toLowerCase().includes(venueName.toLowerCase()) ? sub : `${venueName} — ${sub}`,
        ...base,
        holePars: holeParsOf(groups.get(sub)!, venue.center),
      });
    }
    // Unlabelled holes alongside labelled courses only count as a course of
    // their own if there are enough of them to be one.
    const unnamed = groups.get('') || [];
    if (unnamed.length >= 9) {
      courses.push({ id: `osm-${venue.key}`, name: venueName, ...base, holePars: holeParsOf(unnamed, venue.center) });
    }
  }

  return courses.sort((a, b) =>
    Number(b.inside) - Number(a.inside) ||
    a.distanceM - b.distanceM ||
    Object.keys(b.holePars).length - Object.keys(a.holePars).length
  );
}

// Lookups are cached per ~100m for the session, so reopening a panel or
// several panels on one screen don't each hit the public Overpass servers.
const lookupCache = new Map<string, Promise<DetectedCourse[]>>();

export async function findCoursesNear(lat: number, lng: number): Promise<DetectedCourse[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  let pending = lookupCache.get(key);
  if (!pending) {
    pending = runOverpass(buildQuery(lat, lng)).then((elements) => parseCourses(elements, lat, lng));
    lookupCache.set(key, pending);
    pending.catch(() => lookupCache.delete(key));
  }
  return pending;
}

// Courses at or near where the player is right now, best match first.
export async function detectNearbyCourses(): Promise<DetectedCourse[]> {
  const { lat, lng } = await getCurrentPosition();
  return findCoursesNear(lat, lng);
}

// The course's par for each of the lobby's holes. A 9-hole course played as
// 18 goes round twice, so holes 10-18 repeat 1-9 — a course counts as 9-hole
// when it has a front nine and at most a couple of strays numbered 10+
// (holes of a neighbouring course that cross its boundary). Any hole the map
// has no par for keeps the fallback's (normally what the player has already).
export function buildParTable(holePars: Record<number, number>, holes: 9 | 18, fallback: number[]): { pars: number[]; fromMap: number } {
  const mapped = Object.keys(holePars).map(Number);
  const front = mapped.filter((h) => h <= 9).length;
  const back = mapped.filter((h) => h >= 10 && h <= 18).length;
  const nineHoleCourse = front >= 5 && back <= 2;
  let fromMap = 0;
  const pars = Array.from({ length: holes }, (_, i) => {
    const hole = i + 1;
    const par = nineHoleCourse && hole > 9 ? holePars[hole - 9] : holePars[hole];
    if (par !== undefined) {
      fromMap += 1;
      return par;
    }
    return fallback[i] ?? DEFAULT_PAR;
  });
  return { pars, fromMap };
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
