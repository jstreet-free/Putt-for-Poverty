import { verifyCaller } from './_lib/auth.js';
import { db, FieldValue, isAdminCaller } from './_lib/admin.js';
import { parseClub } from './_lib/clubs.js';
import { HttpError, sendError } from './_lib/http.js';
import { validatePars } from './_lib/scoring.js';

// Every par change, while the lobby is scheduled or live. Routed through the
// server (not a client write) so the same validation applies everywhere and
// the rules stay strict about what clients can touch.
//
//   target 'event'    (default) the lobby's own par — what every player who
//                     hasn't set their own plays to. Host or admin.
//   target 'player'   one player's own par, for when they're at a different
//                     club from the rest of the field. The player themself,
//                     or an admin. `pars: null` drops it, back to the event's.
//   target 'everyone' admin only: sets the event's par and clears every
//                     player's own, so the whole field plays the same card.
//
// `club` ({ id, name }) is the course the par came from, shown next to the
// player on the leaderboard. Omit it to leave the stored club alone.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId, pars, target = 'event', userId, club: rawClub } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }
    if (target !== 'event' && target !== 'player' && target !== 'everyone') {
      throw new HttpError(400, "target must be 'event', 'player' or 'everyone'.");
    }
    const club = parseClub(rawClub);

    const lobbyRef = db.collection('lobbies').doc(lobbyId);
    const lobbySnap = await lobbyRef.get();
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;

    if (lobby.status !== 'scheduled' && lobby.status !== 'live') {
      throw new HttpError(409, 'Par can only be changed before or during the event.');
    }
    const admin = await isAdminCaller(caller);

    if (target === 'player') {
      const playerId = typeof userId === 'string' && userId ? userId : caller.uid;
      if (!admin && playerId !== caller.uid) {
        throw new HttpError(403, "Only an admin can change another player's par.");
      }
      const memberRef = lobbyRef.collection('members').doc(playerId);
      const memberSnap = await memberRef.get();
      if (!memberSnap.exists) {
        throw new HttpError(404, playerId === caller.uid ? "You're not in this lobby." : "That player isn't in this lobby.");
      }

      if (pars === null) {
        await memberRef.update({ pars: FieldValue.delete(), club: FieldValue.delete() });
        return res.status(200).json({ ok: true });
      }
      const parError = validatePars(pars, lobby.holes);
      if (parError) throw new HttpError(400, parError);

      await memberRef.update({
        pars,
        ...(club !== undefined ? { club: club ?? FieldValue.delete() } : {}),
      });
      return res.status(200).json({ ok: true });
    }

    if (target === 'everyone' && !admin) {
      throw new HttpError(403, 'Only an admin can change the par for everyone.');
    }
    if (target === 'event' && !admin && lobby.creatorId !== caller.uid) {
      throw new HttpError(403, 'Only the host can change the par.');
    }
    const parError = validatePars(pars, lobby.holes);
    if (parError) throw new HttpError(400, parError);

    const lobbyUpdate = {
      pars,
      updatedAt: new Date(),
      ...(club !== undefined ? { club: club ?? FieldValue.delete() } : {}),
    };

    if (target === 'event') {
      await lobbyRef.update(lobbyUpdate);
    } else {
      const membersSnap = await lobbyRef.collection('members').get();
      const batch = db.batch();
      batch.update(lobbyRef, lobbyUpdate);
      for (const memberDoc of membersSnap.docs) {
        batch.update(memberDoc.ref, { pars: FieldValue.delete(), club: FieldValue.delete() });
      }
      await batch.commit();
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
