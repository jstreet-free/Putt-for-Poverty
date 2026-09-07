import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import Stripe from 'stripe';

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}
const db = getFirestore();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

  const { sessionId } = req.body;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const userId = session.metadata?.userId;
      if (userId) {
        const userRef = db.collection('participants').doc(userId);
        const doc = await userRef.get();

        if (doc.exists) {
          // Check if this session was already processed to avoid double counting
          const processedSessions = doc.get('processedSessions') || [];
          if (!processedSessions.includes(sessionId)) {
            await userRef.update({
              paidRounds: FieldValue.increment(1),
              processedSessions: FieldValue.arrayUnion(sessionId),
              updatedAt: new Date().toISOString()
            });

            // Set admin if matching special email
            const email = session.customer_details?.email || session.customer_email;
            if (email === 'jstreet@freeatlast.st') {
              await userRef.update({ role: 'admin' });
            }
          }
        }
      }
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ error: "Payment not completed" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
