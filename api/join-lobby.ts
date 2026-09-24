import { verifyCaller } from './_lib/auth';
import { db, FieldValue } from './_lib/admin';
import { getActiveLobbyId } from './_lib/lobbies';
import { HttpError, sendError } from './_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId, code } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }

    const lobbyRef = db.collection('lobbies').doc(lobbyId);
    const lobbySnap = await lobbyRef.get();
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;

    if (lobby.status !== 'scheduled') {
      throw new HttpError(409, 'This lobby is no longer open to join.');
    }
    if (lobby.eventDate.toMillis() <= Date.now()) {
      throw new HttpError(409, 'This lobby has already started.');
    }

    // Already a member (e.g. a double-submit) — treat as success, not an error.
    const existingMemberSnap = await lobbyRef.collection('members').doc(caller.uid).get();
    if (existingMemberSnap.exists) {
      return res.status(200).json({ ok: true, alreadyMember: true });
    }

    if (lobby.isClosed) {
      const secretSnap = await lobbyRef.collection('secret').doc('join').get();
      const actualCode = secretSnap.data()?.code;
      if (!actualCode || String(code || '').trim().toUpperCase() !== String(actualCode).toUpperCase()) {
        throw new HttpError(403, 'Invalid code.');
      }
    }

    const participantSnap = await db.collection('participants').doc(caller.uid).get();
    const participant = participantSnap.data();
    if (!participant || (participant.paidRounds || 0) <= (participant.usedRounds || 0)) {
      throw new HttpError(403, 'You need an available round (credit) to join a lobby.');
    }
    if (!participant.name) {
      throw new HttpError(400, 'Complete your player profile before joining a lobby.');
    }

    const activeLobbyId = await getActiveLobbyId(caller.uid);
    if (activeLobbyId && activeLobbyId !== lobbyId) {
      throw new HttpError(409, "You're already in an active lobby.");
    }

    const batch = db.batch();
    batch.set(lobbyRef.collection('members').doc(caller.uid), {
      userId: caller.uid,
      name: participant.name,
      golfClub: participant.golfClub || '',
      avatarUrl: participant.avatarUrl || '',
      joinedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('users').doc(caller.uid).collection('lobbyMemberships').doc(lobbyId), {
      lobbyId,
      joinedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
