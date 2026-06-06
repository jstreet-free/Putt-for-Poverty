import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import dotenv from "dotenv";
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
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

      res.json({ id: session.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/verify-payment", async (req, res) => {
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
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Payment not completed" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
