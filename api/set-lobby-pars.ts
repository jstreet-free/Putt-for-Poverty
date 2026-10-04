import { verifyCaller } from './_lib/auth.js';
import { db, isAdminCaller } from './_lib/admin.js';
import { HttpError, sendError } from './_lib/http.js';
import { validatePars } from './_lib/scoring.js';

// The host can change a hole's par while the lobby is scheduled or live.
// Routed through the server (not a client write) so the same validation
// applies everywhere and the rules stay strict about what clients can touch.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId, pars } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }

    const lobbyRef = db.collection('lobbies').doc(lobbyId);
    const lobbySnap = await lobbyRef.get();
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;

    const admin = await isAdminCaller(caller);
    if (!admin && lobby.creatorId !== caller.uid) {
      throw new HttpError(403, 'Only the host can change the par.');
    }
    if (lobby.status !== 'scheduled' && lobby.status !== 'live') {
      throw new HttpError(409, 'Par can only be changed before or during the event.');
    }

    const parError = validatePars(pars, lobby.holes);
    if (parError) throw new HttpError(400, parError);

    await lobbyRef.update({ pars, updatedAt: new Date() });
    res.status(200).json({ ok: true, pars });
  } catch (err) {
    sendError(res, err);
  }
}
