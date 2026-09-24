import { verifyCaller } from './_lib/auth';
import { db, FieldValue, Timestamp } from './_lib/admin';
import { getActiveLobbyId } from './_lib/lobbies';
import { HttpError, sendError } from './_lib/http';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes ambiguous O/0/I/1
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function generateShareCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { name, isClosed, eventDate, holes } = req.body || {};

    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 99) {
      throw new HttpError(400, 'Lobby name must be 1-99 characters.');
    }
    if (typeof isClosed !== 'boolean') {
      throw new HttpError(400, 'isClosed must be a boolean.');
    }
    if (holes !== 9 && holes !== 18) {
      throw new HttpError(400, 'holes must be 9 or 18.');
    }
    const parsedDate = new Date(eventDate);
    if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new HttpError(400, 'eventDate must be a valid date in the future.');
    }

    const participantSnap = await db.collection('participants').doc(caller.uid).get();
    const participant = participantSnap.data();
    if (!participant || (participant.paidRounds || 0) <= (participant.usedRounds || 0)) {
      throw new HttpError(403, 'You need an available round (credit) to create a lobby.');
    }
    if (!participant.name) {
      throw new HttpError(400, 'Complete your player profile before creating a lobby.');
    }

    const activeLobbyId = await getActiveLobbyId(caller.uid);
    if (activeLobbyId) {
      throw new HttpError(409, "You're already in an active lobby.");
    }

    const eventTimestamp = Timestamp.fromDate(parsedDate);
    const expiresAt = Timestamp.fromMillis(eventTimestamp.toMillis() + TWELVE_HOURS_MS);

    const lobbyRef = db.collection('lobbies').doc();
    const batch = db.batch();

    batch.set(lobbyRef, {
      name: name.trim(),
      isClosed,
      eventDate: eventTimestamp,
      holes,
      creatorId: caller.uid,
      creatorName: participant.name,
      status: 'scheduled',
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(lobbyRef.collection('members').doc(caller.uid), {
      userId: caller.uid,
      name: participant.name,
      golfClub: participant.golfClub || '',
      avatarUrl: participant.avatarUrl || '',
      joinedAt: FieldValue.serverTimestamp(),
    });

    batch.set(db.collection('users').doc(caller.uid).collection('lobbyMemberships').doc(lobbyRef.id), {
      lobbyId: lobbyRef.id,
      joinedAt: FieldValue.serverTimestamp(),
    });

    let shareCode: string | null = null;
    if (isClosed) {
      shareCode = generateShareCode();
      batch.set(lobbyRef.collection('secret').doc('join'), {
        creatorId: caller.uid,
        code: shareCode,
      });
    }

    await batch.commit();

    res.status(200).json({ id: lobbyRef.id, shareCode });
  } catch (err) {
    sendError(res, err);
  }
}
