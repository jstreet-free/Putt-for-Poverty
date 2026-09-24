import { db } from './admin';

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
