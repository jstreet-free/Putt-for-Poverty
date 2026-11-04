import { verifyCaller } from './_lib/auth.js';
import { db } from './_lib/admin.js';
import { addPlayerToLobby, assertJoinable } from './_lib/lobbies.js';
import { HttpError, sendError } from './_lib/http.js';

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

    assertJoinable(lobby);

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

    const result = await addPlayerToLobby(lobbyId, caller.uid, 'self');
    if (result.alreadyMember) {
      return res.status(200).json({ ok: true, alreadyMember: true });
    }
    res.status(200).json({ ok: true, charged: result.charged });
  } catch (err) {
    sendError(res, err);
  }
}
