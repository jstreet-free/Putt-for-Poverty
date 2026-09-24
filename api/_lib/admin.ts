import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { VerifiedCaller } from './auth';

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}

export const db = getFirestore();
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
