import { verifyCaller } from './_lib/auth';
import { db, isAdminCaller, Timestamp } from './_lib/admin';
import { finishLobby } from './finish-lobby';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Called on a schedule (Vercel Cron) and also manually from the Admin UI —
// Vercel's free tier only runs cron jobs once a day, so this doubles as the
// catch-up job for anything the per-action server endpoints didn't reach in
// time (a lobby nobody ever started, or a live event nobody finished).
async function isAuthorized(req: any): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader: string | undefined = req.headers?.authorization;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const caller = await verifyCaller(req);
  return isAdminCaller(caller);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await isAuthorized(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Timestamp.now();
  const errors: string[] = [];
  let expiredScheduled = 0;
  let finishedLive = 0;
  let deletedLobbies = 0;

  try {
    // 1. Scheduled lobbies nobody ever started -> expired. No credits charged.
    const dueScheduled = await db.collection('lobbies')
      .where('status', '==', 'scheduled')
      .where('expiresAt', '<=', now)
      .get();

    for (const lobbyDoc of dueScheduled.docs) {
      try {
        await lobbyDoc.ref.update({
          status: 'expired',
          expiresAt: Timestamp.fromMillis(now.toMillis() + SEVEN_DAYS_MS),
          updatedAt: now,
        });
        expiredScheduled++;
      } catch (err: any) {
        errors.push(`expire ${lobbyDoc.id}: ${err.message}`);
      }
    }

    // 2. Live lobbies whose event window ran out -> finish (charges were
    // already made at Start; this only scores and archives).
    const dueLive = await db.collection('lobbies')
      .where('status', '==', 'live')
      .where('expiresAt', '<=', now)
      .get();

    for (const lobbyDoc of dueLive.docs) {
      try {
        await finishLobby(lobbyDoc.id);
        finishedLive++;
      } catch (err: any) {
        errors.push(`finish ${lobbyDoc.id}: ${err.message}`);
      }
    }

    // 3. Finished/expired lobbies past their cleanup deadline -> delete.
    // History was already copied to each member's users/{uid}/history, so
    // it survives the lobby document being removed.
    const dueCleanup = await db.collection('lobbies')
      .where('status', 'in', ['finished', 'expired'])
      .where('expiresAt', '<=', now)
      .get();

    for (const lobbyDoc of dueCleanup.docs) {
      try {
        const membersSnap = await lobbyDoc.ref.collection('members').get();
        const batch = db.batch();
        for (const memberDoc of membersSnap.docs) {
          batch.delete(db.collection('users').doc(memberDoc.id).collection('lobbyMemberships').doc(lobbyDoc.id));
        }
        await batch.commit();
        await db.recursiveDelete(lobbyDoc.ref);
        deletedLobbies++;
      } catch (err: any) {
        errors.push(`delete ${lobbyDoc.id}: ${err.message}`);
      }
    }

    res.status(200).json({ expiredScheduled, finishedLive, deletedLobbies, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
