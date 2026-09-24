import { verifyCaller } from './_lib/auth';
import { db, Timestamp } from './_lib/admin';
import { isAdminCaller } from './_lib/admin';
import { HttpError, sendError } from './_lib/http';
import { rankScorecards, ScorecardLike } from './_lib/scoring';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Exported so api/lobby-maintenance.ts can call this directly for lobbies
// whose event has run past its window without the host pressing Finish.
export async function finishLobby(lobbyId: string): Promise<{ standingsCount: number }> {
  const lobbyRef = db.collection('lobbies').doc(lobbyId);

  const outcome = await db.runTransaction(async (tx) => {
    const lobbySnap = await tx.get(lobbyRef);
    if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
    const lobby = lobbySnap.data()!;
    if (lobby.status !== 'live') throw new HttpError(409, 'Lobby is not live.');

    const membersSnap = await tx.get(lobbyRef.collection('members'));
    const scorecardsSnap = await tx.get(lobbyRef.collection('scorecards'));
    const scorecardByUid = new Map(scorecardsSnap.docs.map((d) => [d.id, d.data()]));

    const chargedMembers = membersSnap.docs.filter((d) => d.data().chargeStatus === 'charged');

    // Never trust client-computed totals — recompute from raw per-hole
    // strokes, discarding anything with an invalid hole number or value.
    const cards: ScorecardLike[] = chargedMembers.map((memberDoc) => {
      const member = memberDoc.data();
      const card = scorecardByUid.get(memberDoc.id);
      const strokes = card?.strokes && typeof card.strokes === 'object' ? card.strokes : {};

      let total = 0;
      let holesPlayed = 0;
      for (const key of Object.keys(strokes)) {
        const holeNum = parseInt(key, 10);
        const value = strokes[key];
        if (!Number.isInteger(holeNum) || holeNum < 1 || holeNum > lobby.holes) continue;
        if (!Number.isInteger(value) || value < 1 || value > 15) continue;
        total += value;
        holesPlayed += 1;
      }

      return { userId: memberDoc.id, name: member.name, avatarUrl: member.avatarUrl || undefined, total, holesPlayed };
    });

    const standings = rankScorecards(cards);
    const now = Timestamp.now();

    const result = {
      lobbyId,
      lobbyName: lobby.name,
      eventDate: lobby.eventDate,
      startedAt: lobby.startedAt || null,
      finishedAt: now,
      holes: lobby.holes,
      standings,
    };

    tx.set(lobbyRef.collection('results').doc('final'), result);

    for (const memberDoc of membersSnap.docs) {
      const uid = memberDoc.id;
      const standingRow = standings.find((s) => s.userId === uid) || null;
      const historyEntry = {
        ...result,
        myPosition: standingRow ? standingRow.position : null,
        myTotal: standingRow ? standingRow.total : null,
        playerCount: standings.length,
      };
      tx.set(db.collection('users').doc(uid).collection('history').doc(lobbyId), historyEntry);
    }

    tx.update(lobbyRef, {
      status: 'finished',
      finishedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + SEVEN_DAYS_MS),
      updatedAt: now,
    });

    return { standingsCount: standings.length };
  });

  // Firestore transactions can't recursively delete a subcollection, so this
  // runs just after — the lobby is already 'finished' by this point, so a
  // location write racing in gets rejected by the rules regardless.
  await db.recursiveDelete(lobbyRef.collection('locations'));

  return outcome;
}

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
    const memberSnap = await lobbyRef.collection('members').doc(caller.uid).get();
    const isMember = memberSnap.exists;
    const isPastExpiry = lobby.expiresAt && lobby.expiresAt.toMillis() <= Date.now();

    // The host or an admin can always finish. Otherwise, any member can
    // trigger it once the event's window has run out — this is the
    // client-side fallback for Vercel's once-a-day cron (see Phase 6).
    if (!admin && !isCreator && !(isMember && isPastExpiry)) {
      throw new HttpError(403, 'Only the host can finish this event.');
    }

    const result = await finishLobby(lobbyId);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err);
  }
}
