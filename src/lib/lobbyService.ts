import { db } from './firebase';
import {
  collection, doc, deleteDoc, getDoc, getDocs, getCountFromServer,
  limit as fbLimit, onSnapshot, query, serverTimestamp, setDoc, Timestamp,
} from 'firebase/firestore';
import { Lobby, LobbyLocation, LobbyMember } from '../types';

// A lobby's event runs for 8 hours from its scheduled start. Kept in sync with
// the same window in firestore.rules, which is what actually enforces it.
export const EVENT_DURATION_MS = 8 * 60 * 60 * 1000;

function membershipRef(userId: string, lobbyId: string) {
  return doc(db, 'users', userId, 'lobbyMemberships', lobbyId);
}

export function lobbyStartMs(lobby: Pick<Lobby, 'eventDate'>): number {
  const value: any = lobby.eventDate;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return new Date(value).getTime();
}

export function isLobbyLive(lobby: Pick<Lobby, 'eventDate'>, now = Date.now()): boolean {
  const start = lobbyStartMs(lobby);
  return start > 0 && now >= start && now < start + EVENT_DURATION_MS;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes ambiguous O/0/I/1

export function generateShareCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

interface CreateLobbyInput {
  name: string;
  isClosed: boolean;
  eventDate: Date;
  creatorId: string;
  creatorName: string;
  creatorGolfClub?: string;
  creatorAvatarUrl?: string;
}

// Writes are sequential (not batched) on purpose: the member/secret-join
// security rules read the parent lobby doc via get(), which only sees
// already-committed writes — batching them would make that get() see the
// lobby as not-yet-existing and fail the permission check.
export async function createLobby(input: CreateLobbyInput): Promise<{ id: string; shareCode: string | null }> {
  const lobbyRef = doc(collection(db, 'lobbies'));
  await setDoc(lobbyRef, {
    name: input.name,
    isClosed: input.isClosed,
    eventDate: Timestamp.fromDate(input.eventDate),
    creatorId: input.creatorId,
    creatorName: input.creatorName,
    status: 'scheduled',
    createdAt: serverTimestamp(),
  });

  let shareCode: string | null = null;
  if (input.isClosed) {
    shareCode = generateShareCode();
    await setDoc(doc(db, 'lobbies', lobbyRef.id, 'secret', 'join'), {
      creatorId: input.creatorId,
      code: shareCode,
    });
  }

  await setDoc(doc(db, 'lobbies', lobbyRef.id, 'members', input.creatorId), {
    userId: input.creatorId,
    name: input.creatorName,
    golfClub: input.creatorGolfClub || '',
    avatarUrl: input.creatorAvatarUrl || '',
    joinedAt: serverTimestamp(),
  });

  await setDoc(membershipRef(input.creatorId, lobbyRef.id), {
    lobbyId: lobbyRef.id,
    joinedAt: serverTimestamp(),
  });

  return { id: lobbyRef.id, shareCode };
}

interface JoinLobbyInput {
  lobbyId: string;
  isClosed: boolean;
  userId: string;
  name: string;
  golfClub?: string;
  avatarUrl?: string;
  enteredCode?: string;
}

export async function joinLobby(input: JoinLobbyInput): Promise<void> {
  const data: Record<string, unknown> = {
    userId: input.userId,
    name: input.name,
    golfClub: input.golfClub || '',
    avatarUrl: input.avatarUrl || '',
    joinedAt: serverTimestamp(),
  };
  if (input.isClosed) {
    data.enteredCode = input.enteredCode || '';
  }
  await setDoc(doc(db, 'lobbies', input.lobbyId, 'members', input.userId), data);
  await setDoc(membershipRef(input.userId, input.lobbyId), {
    lobbyId: input.lobbyId,
    joinedAt: serverTimestamp(),
  });
}

export async function leaveLobby(lobbyId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', userId));
  await deleteDoc(membershipRef(userId, lobbyId));
}

export async function kickMember(lobbyId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', memberId));
  await deleteDoc(membershipRef(memberId, lobbyId));
}

export async function deleteLobby(lobbyId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId));
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
  if (updates.eventDate !== undefined) payload.eventDate = Timestamp.fromDate(updates.eventDate);
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

// Backfills the membership index for anyone who joined a lobby before that
// index existed. Cheap and idempotent: one read, and a write only if missing.
export async function ensureMembershipIndexed(userId: string, lobbyId: string): Promise<void> {
  const ref = membershipRef(userId, lobbyId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, { lobbyId, joinedAt: serverTimestamp() });
}

export async function getMemberPreview(lobbyId: string, max = 5): Promise<LobbyMember[]> {
  const snap = await getDocs(query(collection(db, 'lobbies', lobbyId, 'members'), fbLimit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyMember));
}

export async function writeLobbyLocation(lobbyId: string, userId: string, lat: number, lng: number): Promise<void> {
  await setDoc(doc(db, 'lobbies', lobbyId, 'locations', userId), {
    userId,
    lat,
    lng,
    updatedAt: new Date().toISOString(),
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
// that needs a manually created index, and its rule spends get() calls against
// the 10-document-access budget Firestore allows a single query.
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
