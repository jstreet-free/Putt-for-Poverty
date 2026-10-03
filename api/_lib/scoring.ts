// Mirror of src/lib/lobbyScoring.ts. Duplicated (not imported) because the
// /api functions are bundled separately from the Vite client. Any change to
// the ranking or par rules must be made in BOTH files — the live leaderboard
// and the final result have to agree.

export type StandingStatus = 'finished' | 'playing' | 'dnf' | 'not_started';

export interface StandingRowLike {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;
  holesPlayed: number;
  toPar: number;
  position: number | null;
  status: StandingStatus;
}

export const DEFAULT_PAR = 4;
export const MIN_PAR = 2;
export const MAX_PAR = 6;

export function getPars(lobby: { holes: 9 | 18; pars?: number[] }): number[] {
  if (Array.isArray(lobby.pars) && lobby.pars.length === lobby.holes) return lobby.pars;
  return Array.from({ length: lobby.holes }, () => DEFAULT_PAR);
}

export interface Tally {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;
  parPlayed: number;
  holesPlayed: number;
}

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

export function rankScorecards(tallies: Tally[], holes: number, mode: 'live' | 'final'): StandingRowLike[] {
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

  const ranked: StandingRowLike[] = [];
  positioned.forEach((row, index) => {
    const prev = index > 0 ? positioned[index - 1] : null;
    const position = prev && prev.toPar === row.toPar ? ranked[index - 1].position : index + 1;
    ranked.push(toStandingRow(row, position));
  });

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

function toStandingRow(row: Tally & { toPar: number; status: StandingStatus }, position: number | null): StandingRowLike {
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
