import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}
const db = getFirestore();

export default function handler(req: any, res: any) {
  res.status(200).json({ status: "ok" });
}
