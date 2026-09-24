import { verifyCaller } from './_lib/auth';
import { db, isAdminCaller } from './_lib/admin';
import { HttpError, sendError } from './_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }

    const lobbyRef = db.collection('lobbies').doc(lobbyId);
    const lobbySnap = await lobbyRef.get();
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;

    const admin = await isAdminCaller(caller);
    const isCreator = lobby.creatorId === caller.uid;
    if (!admin && !(isCreator && lobby.status === 'scheduled')) {
      throw new HttpError(403, 'You cannot delete this lobby.');
    }

    const membersSnap = await lobbyRef.collection('members').get();
    const batch = db.batch();
    for (const memberDoc of membersSnap.docs) {
      batch.delete(db.collection('users').doc(memberDoc.id).collection('lobbyMemberships').doc(lobbyId));
    }
    await batch.commit();

    await db.recursiveDelete(lobbyRef);

    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
