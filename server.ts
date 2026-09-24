// Must be the very first import: this runs dotenv's .env loading as a side
// effect. ES module imports are all evaluated before this file's own body
// runs, so if this weren't first, ./api/_lib/firebaseAdmin (pulled in below,
// transitively, by the lobby handlers) would read process.env.
// FIREBASE_SERVICE_ACCOUNT_KEY before .env had populated it.
import 'dotenv/config';

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import { FieldValue } from 'firebase-admin/firestore';
import { verifyCaller } from './api/_lib/auth';
import { db } from './api/_lib/firebaseAdmin';
import lobbyMaintenanceHandler from './api/lobby-maintenance';
import createLobbyHandler from './api/create-lobby';
import joinLobbyHandler from './api/join-lobby';
import startLobbyHandler from './api/start-lobby';
import finishLobbyHandler from './api/finish-lobby';
import deleteLobbyHandler from './api/delete-lobby';

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

    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const userId = caller.uid;
      const userEmail = caller.email;

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
        ...(userEmail ? { customer_email: userEmail } : {}),
      });

      res.json({ id: session.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/verify-payment", async (req, res) => {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.body;
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        const userId = session.metadata?.userId;

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
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Payment not completed" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.all("/api/lobby-maintenance", (req, res) => lobbyMaintenanceHandler(req, res));
  app.post("/api/create-lobby", (req, res) => createLobbyHandler(req, res));
  app.post("/api/join-lobby", (req, res) => joinLobbyHandler(req, res));
  app.post("/api/start-lobby", (req, res) => startLobbyHandler(req, res));
  app.post("/api/finish-lobby", (req, res) => finishLobbyHandler(req, res));
  app.post("/api/delete-lobby", (req, res) => deleteLobbyHandler(req, res));

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
