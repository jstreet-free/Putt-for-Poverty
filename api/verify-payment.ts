import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { verifyCaller } from './_lib/auth';
import { db } from './_lib/firebaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const caller = await verifyCaller(req);
  if (!caller) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

  const { sessionId } = req.body;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const userId = session.metadata?.userId;

      // The session's metadata.userId was set from the caller's verified uid
      // at checkout-session creation time — reject if it doesn't match the
      // caller verifying it now, so nobody can credit another account.
      if (!userId || userId !== caller.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

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
