import { HttpError } from './http.js';

export interface ClubRef {
  id: string;
  name: string;
}

// The course a par was taken from, as sent by the client (found from the
// player's location, see src/lib/clubLocator.ts). `undefined` means "leave
// the stored club alone", `null` means "clear it".
export function parseClub(value: unknown): ClubRef | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const { id, name } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.length < 1 || id.length > 200 ||
      typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 150) {
    throw new HttpError(400, 'club must have an id and a name.');
  }
  return { id, name: name.trim() };
}
