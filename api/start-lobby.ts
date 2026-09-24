import { verifyCaller } from './_lib/auth';
import { db, FieldValue, Timestamp } from './_lib/admin';
import { isAdminCaller } from './_lib/admin';
import { HttpError, sendError } from './_lib/http';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

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

    // Authorization is checked before the transaction — it doesn't need to be
    // transactionally consistent with the lobby's own state.
    const admin = await isAdminCaller(caller);

    const lobbyRef = db.collection('lobbies').doc(lobbyId);

    const summary = await db.runTransaction(async (tx) => {
      const lobbySnap = await tx.get(lobbyRef);
      if (!lobbySnap.exists) throw new HttpError(404, 'Lobby not found.');
      const lobby = lobbySnap.data()!;

      if (!admin && lobby.creatorId !== caller.uid) {
        throw new HttpError(403, 'Only the host can start this event.');
      }
      if (lobby.status !== 'scheduled') {
        throw new HttpError(409, 'This lobby has already been started.');
      }

      const eventMs = lobby.eventDate.toMillis();
      const now = Date.now();
      if (now < eventMs - FIFTEEN_MIN_MS) {
        throw new HttpError(409, 'Too early to start this event.');
      }
      if (now > eventMs + TWELVE_HOURS_MS) {
        throw new HttpError(409, 'This event window has passed.');
      }

      // All reads before any writes, per Firestore transaction rules.
      const membersSnap = await tx.get(lobbyRef.collection('members'));
      const participantSnaps = await Promise.all(
        membersSnap.docs.map((memberDoc) => tx.get(db.collection('participants').doc(memberDoc.id)))
      );

      const nowTs = Timestamp.now();
      let charged = 0;
      let skipped = 0;

      membersSnap.docs.forEach((memberDoc, index) => {
        const participantSnap = participantSnaps[index];
        if (!participantSnap.exists) {
          tx.update(memberDoc.ref, { chargeStatus: 'no_participant_record' });
          skipped++;
          return;
        }

        const participant = participantSnap.data()!;
        const paidRounds = participant.paidRounds || 0;
        const usedRounds = participant.usedRounds || 0;

        if (paidRounds > usedRounds) {
          tx.update(participantSnap.ref, {
            usedRounds: FieldValue.increment(1),
            updatedAt: new Date().toISOString(),
          });
          tx.update(memberDoc.ref, { chargeStatus: 'charged', chargedAt: nowTs });
          charged++;
        } else {
          tx.update(memberDoc.ref, { chargeStatus: 'insufficient_credit' });
          skipped++;
        }
      });

      tx.update(lobbyRef, {
        status: 'live',
        startedAt: nowTs,
        expiresAt: Timestamp.fromMillis(nowTs.toMillis() + TWELVE_HOURS_MS),
        updatedAt: nowTs,
      });

      return { charged, skipped };
    });

    res.status(200).json(summary);
  } catch (err) {
    sendError(res, err);
  }
}
