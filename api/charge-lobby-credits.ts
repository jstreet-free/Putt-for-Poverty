import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { verifyCaller } from './_lib/auth';

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}
const db = getFirestore();

const SPECIAL_ADMIN_EMAIL = 'jstreet@freeatlast.st';

// Called on a schedule (Vercel Cron) to charge each lobby member one credit
// once the lobby's eventDate arrives. Also callable by a signed-in admin
// (from the Admin UI) as a manual fallback, since Vercel's free tier only
// runs cron jobs once a day.
async function isAuthorized(req: any): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader: string | undefined = req.headers?.authorization;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const caller = await verifyCaller(req);
  if (!caller) return false;
  if (caller.email === SPECIAL_ADMIN_EMAIL) return true;

  const [participantSnap, userSnap] = await Promise.all([
    db.collection('participants').doc(caller.uid).get(),
    db.collection('users').doc(caller.uid).get(),
  ]);
  return participantSnap.data()?.role === 'admin' || userSnap.data()?.role === 'admin';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await isAuthorized(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = Timestamp.now();
    const dueLobbies = await db.collection('lobbies')
      .where('status', '==', 'scheduled')
      .where('eventDate', '<=', now)
      .get();

    let chargedLobbies = 0;
    let chargedMembers = 0;
    let skippedMembers = 0;

    for (const lobbyDoc of dueLobbies.docs) {
      const membersSnap = await lobbyDoc.ref.collection('members').get();

      for (const memberDoc of membersSnap.docs) {
        const uid = memberDoc.id;
        const participantRef = db.collection('participants').doc(uid);
        const participantSnap = await participantRef.get();

        if (!participantSnap.exists) {
          await memberDoc.ref.update({ chargeStatus: 'no_participant_record' });
          skippedMembers++;
          continue;
        }

        const data = participantSnap.data() || {};
        const paidRounds = data.paidRounds || 0;
        const usedRounds = data.usedRounds || 0;

        if (paidRounds > usedRounds) {
          await participantRef.update({
            usedRounds: FieldValue.increment(1),
            updatedAt: new Date().toISOString(),
          });
          await memberDoc.ref.update({
            chargeStatus: 'charged',
            chargedAt: new Date().toISOString(),
          });
          chargedMembers++;
        } else {
          await memberDoc.ref.update({ chargeStatus: 'insufficient_credit' });
          skippedMembers++;
        }
      }

      await lobbyDoc.ref.update({
        status: 'charged',
        chargedAt: new Date().toISOString(),
      });
      chargedLobbies++;
    }

    res.status(200).json({ chargedLobbies, chargedMembers, skippedMembers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
