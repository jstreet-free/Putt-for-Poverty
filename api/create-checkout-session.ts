import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const { userId, userEmail } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: "Putt for Poverty - Tournament Round",
              description: "Official 18-hole scoring round for the charity event.",
            },
            unit_amount: 2000, // £20.00
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/register?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/register?canceled=true`,
      metadata: {
        userId,
      },
      customer_email: userEmail,
    });

    res.status(200).json({ id: session.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
