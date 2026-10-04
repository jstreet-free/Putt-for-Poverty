import { StandingRow, StandingStatus } from '../types';

// Stroke play, to par — the same scoring a normal tournament uses. Each hole
// is compared to its par; the lowest total relative to par wins. Keep in sync
// with api/_lib/scoring.ts, which duplicates this for the server (the /api
// functions are bundled separately, so they can't import from src/).

export const DEFAULT_PAR = 4;
export const MIN_PAR = 2;
export const MAX_PAR = 6;

export function getPars(lobby: { holes: 9 | 18; pars?: number[] }): number[] {
  if (Array.isArray(lobby.pars) && lobby.pars.length === lobby.holes) return lobby.pars;
  return Array.from({ length: lobby.holes }, () => DEFAULT_PAR);
}

export function formatToPar(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

export interface Tally {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;      // strokes over the holes played
  parPlayed: number;  // par over those same holes
  holesPlayed: number;
}

// Sums one player's strokes, ignoring anything out of range so a malformed
// card can't skew the standings. Only holes that were actually played count
// toward par — a half-finished card is compared like-for-like.
export function tallyStrokes(strokes: Record<string, number>, pars: number[], holes: number) {
  let total = 0;
  let parPlayed = 0;
  let holesPlayed = 0;
  for (const key of Object.keys(strokes)) {
    const hole = parseInt(key, 10);
    const value = strokes[key];
    if (!Number.isInteger(hole) || hole < 1 || hole > holes) continue;
    if (!Number.isInteger(value) || value < 1 || value > 15) continue;
    total += value;
    parPlayed += pars[hole - 1] ?? DEFAULT_PAR;
    holesPlayed += 1;
  }
  return { total, parPlayed, holesPlayed };
}

// Live (mode 'live'): everyone who has started is ranked by score to par so
// far, like a tournament's running leaderboard. Final (mode 'final'): anyone
// who didn't complete every hole is a DNF and has no place.
//
// Positions share on a tie (T2, T2, 4) — competition ranking, as in golf.
export function rankScorecards(tallies: Tally[], holes: number, mode: 'live' | 'final'): StandingRow[] {
  const rows = tallies.map((t) => {
    const status: StandingStatus =
      t.holesPlayed === 0 ? 'not_started'
      : t.holesPlayed >= holes ? 'finished'
      : mode === 'final' ? 'dnf'
      : 'playing';
    return { ...t, toPar: t.total - t.parPlayed, status };
  });

  const positioned = rows
    .filter((r) => r.status === 'finished' || r.status === 'playing')
    .sort((a, b) => a.toPar - b.toPar || a.name.localeCompare(b.name));

  const ranked: StandingRow[] = [];
  positioned.forEach((row, index) => {
    const prev = index > 0 ? positioned[index - 1] : null;
    const position = prev && prev.toPar === row.toPar ? ranked[index - 1].position : index + 1;
    ranked.push(toStandingRow(row, position));
  });

  // DNFs: the more holes they completed, the higher they sit among the DNFs.
  const dnfs = rows
    .filter((r) => r.status === 'dnf')
    .sort((a, b) => b.holesPlayed - a.holesPlayed || a.toPar - b.toPar || a.name.localeCompare(b.name))
    .map((r) => toStandingRow(r, null));

  const notStarted = rows
    .filter((r) => r.status === 'not_started')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => toStandingRow(r, null));

  return [...ranked, ...dnfs, ...notStarted];
}

function toStandingRow(row: Tally & { toPar: number; status: StandingStatus }, position: number | null): StandingRow {
  return {
    userId: row.userId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    total: row.total,
    holesPlayed: row.holesPlayed,
    toPar: row.toPar,
    position,
    status: row.status,
  };
}

export function validatePars(pars: unknown, holes: number): string | null {
  if (!Array.isArray(pars) || pars.length !== holes) {
    return `Par must be set for each of the ${holes} holes.`;
  }
  if (!pars.every((p) => Number.isInteger(p) && p >= MIN_PAR && p <= MAX_PAR)) {
    return `Each hole's par must be a whole number from ${MIN_PAR} to ${MAX_PAR}.`;
  }
  return null;
}
