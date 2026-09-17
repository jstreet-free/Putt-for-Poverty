import { db } from './firebase';
import {
  collection, collectionGroup, doc, deleteDoc, getDoc, getDocs, getCountFromServer,
  query, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import { Lobby } from '../types';

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
  enteredCode?: string;
}

export async function joinLobby(input: JoinLobbyInput): Promise<void> {
  const data: Record<string, unknown> = {
    userId: input.userId,
    name: input.name,
    golfClub: input.golfClub || '',
    joinedAt: serverTimestamp(),
  };
  if (input.isClosed) {
    data.enteredCode = input.enteredCode || '';
  }
  await setDoc(doc(db, 'lobbies', input.lobbyId, 'members', input.userId), data);
}

export async function leaveLobby(lobbyId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', userId));
}

export async function kickMember(lobbyId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', lobbyId, 'members', memberId));
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

// Uses a collection-group query scoped to the caller's own membership docs
// (doc id == uid, enforced at write time), so the "members" security rule
// resolves to true for every document this query could possibly match.
export async function getMyLobbies(uid: string): Promise<Lobby[]> {
  const membershipQuery = query(collectionGroup(db, 'members'), where('userId', '==', uid));
  const memberSnap = await getDocs(membershipQuery);

  const lobbies = await Promise.all(memberSnap.docs.map(async (memberDoc) => {
    const lobbyRef = memberDoc.ref.parent.parent;
    if (!lobbyRef) return null;
    const lobbySnap = await getDoc(lobbyRef);
    return lobbySnap.exists() ? ({ id: lobbySnap.id, ...lobbySnap.data() } as Lobby) : null;
  }));

  return lobbies
    .filter((l): l is Lobby => !!l)
    .sort((a, b) => (a.eventDate?.toMillis?.() ?? 0) - (b.eventDate?.toMillis?.() ?? 0));
}
