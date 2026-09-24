import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { VerifiedCaller } from './auth';

export { db } from './firebaseAdmin';
export { FieldValue, Timestamp };

const SPECIAL_ADMIN_EMAIL = 'jstreet@freeatlast.st';

export async function isAdminCaller(caller: VerifiedCaller | null): Promise<boolean> {
  if (!caller) return false;
  if (caller.email === SPECIAL_ADMIN_EMAIL) return true;

  const [participantSnap, userSnap] = await Promise.all([
    db.collection('participants').doc(caller.uid).get(),
    db.collection('users').doc(caller.uid).get(),
  ]);
  return participantSnap.data()?.role === 'admin' || userSnap.data()?.role === 'admin';
}
