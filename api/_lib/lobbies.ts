import { db, FieldValue, Timestamp } from './admin.js';
import { HttpError } from './http.js';

// A user may only be in one lobby at a time with status 'scheduled' or
// 'live' — this is how a single credit is stopped from being used to join
// many lobbies. Reads the user's own membership index rather than querying
// lobbies directly, so it stays cheap regardless of how many lobbies exist.
export async function getActiveLobbyId(uid: string): Promise<string | null> {
  const membershipsSnap = await db.collection('users').doc(uid).collection('lobbyMemberships').get();

  for (const membership of membershipsSnap.docs) {
    const lobbySnap = await db.collection('lobbies').doc(membership.id).get();
    if (!lobbySnap.exists) continue;
    const status = lobbySnap.data()?.status;
    if (status === 'scheduled' || status === 'live') {
      return lobbySnap.id;
    }
  }
  return null;
}

// Open to join while scheduled or live, up until the lobby's window runs out
// (expiresAt: eventDate + 12h while scheduled, startedAt + 12h once live).
export function assertJoinable(lobby: Record<string, any>) {
  if (lobby.status !== 'scheduled' && lobby.status !== 'live') {
    throw new HttpError(409, 'This lobby is no longer open to join.');
  }
  const expiresMs = lobby.expiresAt?.toMillis?.() ?? 0;
  if (expiresMs && expiresMs <= Date.now()) {
    throw new HttpError(409, 'This lobby is no longer open to join.');
  }
}

// Adds a player to a lobby — shared by join-lobby (the player themself) and
// add-lobby-member (the host/admin adding someone). Callers check access
// (invite code, host rights) first; this checks everything about the player.
//
// The writes run in a transaction because adding someone to a lobby that's
// already live charges their credit right here (start-lobby has already
// charged everyone else) — status, membership and credit are re-read so a
// double-submit, or a Start/Finish landing mid-join, can't double-charge or
// charge for a lobby that's no longer joinable.
export async function addPlayerToLobby(
  lobbyId: string,
  uid: string,
  addedBy: 'self' | 'host',
): Promise<{ alreadyMember: boolean; charged: boolean }> {
  const self = addedBy === 'self';

  const activeLobbyId = await getActiveLobbyId(uid);
  if (activeLobbyId && activeLobbyId !== lobbyId) {
    throw new HttpError(409, self ? "You're already in an active lobby." : 'That player is already in another active lobby.');
  }

  const lobbyRef = db.collection('lobbies').doc(lobbyId);
  const memberRef = lobbyRef.collection('members').doc(uid);
  const participantRef = db.collection('participants').doc(uid);

  return db.runTransaction(async (tx) => {
    const [lobbySnap, memberSnap, participantSnap] = await Promise.all([
      tx.get(lobbyRef),
      tx.get(memberRef),
      tx.get(participantRef),
    ]);
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;
    assertJoinable(lobby);

    if (memberSnap.exists) return { alreadyMember: true, charged: false };

    const participant = participantSnap.data();
    if (!participant || (participant.paidRounds || 0) <= (participant.usedRounds || 0)) {
      throw new HttpError(403, self
        ? 'You need an available round (credit) to join a lobby.'
        : "That player doesn't have an available round (credit).");
    }
    if (!participant.name) {
      throw new HttpError(400, self
        ? 'Complete your player profile before joining a lobby.'
        : "That player hasn't completed their profile yet.");
    }

    const isLive = lobby.status === 'live';
    const memberDoc: Record<string, unknown> = {
      userId: uid,
      name: participant.name,
      golfClub: participant.golfClub || '',
      avatarUrl: participant.avatarUrl || '',
      joinedAt: FieldValue.serverTimestamp(),
    };
    if (isLive) {
      tx.update(participantRef, {
        usedRounds: FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      });
      memberDoc.chargeStatus = 'charged';
      memberDoc.chargedAt = Timestamp.now();
    }

    tx.set(memberRef, memberDoc);
    tx.set(db.collection('users').doc(uid).collection('lobbyMemberships').doc(lobbyId), {
      lobbyId,
      joinedAt: FieldValue.serverTimestamp(),
    });
    return { alreadyMember: false, charged: isLive };
  });
}
