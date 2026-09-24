import { db } from './firebase';
import {
  collection, doc, deleteDoc, getDoc, getDocs, getCountFromServer,
  limit as fbLimit, onSnapshot, query, serverTimestamp, setDoc, Timestamp,
} from 'firebase/firestore';
import { Lobby, LobbyLocation, LobbyMember, Scorecard } from '../types';
import { apiCreateLobby, apiDeleteLobby, apiFinishLobby, apiJoinLobby, apiStartLobby } from './lobbyApi';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function membershipRef(userId: string, lobbyId: string) {
  return doc(db, 'users', userId, 'lobbyMemberships', lobbyId);
}

export function lobbyStartMs(lobby: Pick<Lobby, 'eventDate'>): number {
  const value: any = lobby.eventDate;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return new Date(value).getTime();
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes ambiguous O/0/I/1

export function generateShareCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

// --- Lifecycle actions: all go through the server (see src/lib/lobbyApi.ts)
// so a client can never touch status, credits, or membership eligibility
// directly. See firestore.rules — these are the only writes the rules
// actually permit for lobbies/members beyond the host editing minor details
// before start. ---

export async function createLobby(input: {
  name: string; isClosed: boolean; eventDate: Date; holes: 9 | 18;
}): Promise<{ id: string; shareCode: string | null }> {
  return apiCreateLobby({
    name: input.name,
    isClosed: input.isClosed,
    eventDate: input.eventDate.toISOString(),
    holes: input.holes,
  });
}

export async function joinLobby(input: { lobbyId: string; enteredCode?: string }): Promise<{ ok: true; alreadyMember?: boolean }> {
  return apiJoinLobby({ lobbyId: input.lobbyId, code: input.enteredCode });
}

export async function startLobby(lobbyId: string): Promise<{ charged: number; skipped: number }> {
  return apiStartLobby(lobbyId);
}

export async function finishLobby(lobbyId: string): Promise<{ standingsCount: number }> {
  return apiFinishLobby(lobbyId);
}

export async function deleteLobby(lobbyId: string): Promise<void> {
  await apiDeleteLobby(lobbyId);
}

// --- Direct client writes: still permitted by the rules, either because
// they're harmless (editing a still-scheduled lobby's details) or because
// they're the member's own doc (leaving) or one the host/admin can always
// remove (kicking), and only while the lobby hasn't started. ---

export async function leaveLobby(lobbyId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', userId));
  await deleteDoc(membershipRef(userId, lobbyId));
}

export async function kickMember(lobbyId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', memberId));
  await deleteDoc(membershipRef(memberId, lobbyId));
}

// Returns the (possibly newly-generated) share code when the lobby ends up
// closed — the caller needs it to keep showing an up-to-date "share" panel
// right after switching a lobby to private.
export async function updateLobby(
  lobbyId: string,
  updates: { name?: string; isClosed?: boolean; eventDate?: Date },
  creatorId?: string
): Promise<{ shareCode: string | null }> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.isClosed !== undefined) payload.isClosed = updates.isClosed;
  if (updates.eventDate !== undefined) {
    const eventTimestamp = Timestamp.fromDate(updates.eventDate);
    payload.eventDate = eventTimestamp;
    payload.expiresAt = Timestamp.fromMillis(eventTimestamp.toMillis() + TWELVE_HOURS_MS);
  }
  await setDoc(doc(db, 'lobbies', lobbyId), payload, { merge: true });

  if (updates.isClosed !== true || !creatorId) {
    return { shareCode: null };
  }
  const existingCode = await getShareCode(lobbyId);
  if (existingCode) return { shareCode: existingCode };

  const shareCode = generateShareCode();
  await setDoc(doc(db, 'lobbies', lobbyId, 'secret', 'join'), { creatorId, code: shareCode });
  return { shareCode };
}

export async function getShareCode(lobbyId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'lobbies', lobbyId, 'secret', 'join'));
  return snap.exists() ? (snap.data().code as string) : null;
}

export async function getMemberCount(lobbyId: string): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'lobbies', lobbyId, 'members'));
  return snap.data().count;
}

export async function getMemberPreview(lobbyId: string, max = 5): Promise<LobbyMember[]> {
  const snap = await getDocs(query(collection(db, 'lobbies', lobbyId, 'members'), fbLimit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyMember));
}

export function subscribeToLobby(
  lobbyId: string,
  onChange: (lobby: Lobby | null) => void,
  onError?: (err: unknown) => void
) {
  return onSnapshot(
    doc(db, 'lobbies', lobbyId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Lobby) : null),
    (err) => onError?.(err)
  );
}

export function subscribeToScorecards(
  lobbyId: string,
  onChange: (cards: Scorecard[]) => void,
  onError?: (err: unknown) => void
) {
  return onSnapshot(
    collection(db, 'lobbies', lobbyId, 'scorecards'),
    (snap) => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as Scorecard))),
    (err) => onError?.(err)
  );
}

// Saves the player's full set of per-hole strokes (not a delta — a merged
// setDoc replaces the whole `strokes` map, and the rule wants total/
// holesPlayed computed over the complete set anyway). total/holesPlayed are
// recomputed again, server-side and authoritatively, when the lobby finishes.
export async function saveStrokes(
  lobbyId: string,
  player: { uid: string; name: string; avatarUrl?: string },
  strokes: Record<string, number>
): Promise<void> {
  let total = 0;
  let holesPlayed = 0;
  for (const value of Object.values(strokes)) {
    if (Number.isInteger(value) && value > 0) {
      total += value;
      holesPlayed += 1;
    }
  }

  await setDoc(doc(db, 'lobbies', lobbyId, 'scorecards', player.uid), {
    userId: player.uid,
    name: player.name,
    avatarUrl: player.avatarUrl || '',
    strokes,
    total,
    holesPlayed,
    updatedAt: serverTimestamp(),
  });
}

export async function writeLobbyLocation(lobbyId: string, userId: string, lat: number, lng: number): Promise<void> {
  await setDoc(doc(db, 'lobbies', lobbyId, 'locations', userId), {
    userId,
    lat,
    lng,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToLobbyLocations(
  lobbyId: string,
  onChange: (locations: LobbyLocation[]) => void,
  onError?: (err: unknown) => void
) {
  return onSnapshot(
    collection(db, 'lobbies', lobbyId, 'locations'),
    (snap) => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyLocation))),
    (err) => onError?.(err)
  );
}

// Reads the caller's own membership index, then loads those lobby documents
// (which are publicly readable). Deliberately not a collection-group query:
// that needs a manually created index, and its rule would spend get() calls
// against the 10-document-access budget Firestore allows a single query.
export async function getMyLobbies(uid: string): Promise<Lobby[]> {
  const membershipSnap = await getDocs(collection(db, 'users', uid, 'lobbyMemberships'));

  const lobbies = await Promise.all(membershipSnap.docs.map(async (membership) => {
    const lobbySnap = await getDoc(doc(db, 'lobbies', membership.id));
    // A deleted lobby leaves its membership entry behind; just skip it.
    return lobbySnap.exists() ? ({ id: lobbySnap.id, ...lobbySnap.data() } as Lobby) : null;
  }));

  return lobbies
    .filter((l): l is Lobby => !!l)
    .sort((a, b) => lobbyStartMs(a) - lobbyStartMs(b));
}

// The single lobby (if any) that counts toward the "one active lobby per
// user" rule — status 'scheduled' or 'live'. Used to gate Create/Join in the
// UI; the server re-checks this authoritatively regardless.
export async function getMyActiveLobby(uid: string): Promise<Lobby | null> {
  const lobbies = await getMyLobbies(uid);
  return lobbies.find(l => l.status === 'scheduled' || l.status === 'live') || null;
}
