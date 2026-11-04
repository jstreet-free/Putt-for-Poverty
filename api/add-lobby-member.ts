import { verifyCaller } from './_lib/auth.js';
import { db, isAdminCaller } from './_lib/admin.js';
import { addPlayerToLobby } from './_lib/lobbies.js';
import { HttpError, sendError } from './_lib/http.js';

// The host (or an admin) adds a player to their lobby directly — no invite
// code needed. The player still needs their own available credit and no
// other active lobby, exactly as if they'd joined themselves, and is charged
// immediately if the lobby is already live.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId, userId } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }
    if (typeof userId !== 'string' || !userId) {
      throw new HttpError(400, 'userId is required.');
    }

    const lobbySnap = await db.collection('lobbies').doc(lobbyId).get();
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;

    if (lobby.creatorId !== caller.uid && !(await isAdminCaller(caller))) {
      throw new HttpError(403, 'Only the host can add players to this lobby.');
    }

    const result = await addPlayerToLobby(lobbyId, userId, 'host');
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
}
