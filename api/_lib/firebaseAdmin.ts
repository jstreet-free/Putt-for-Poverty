import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Mirrors firebase-applet-config.json (the client's public config). Hardcoded
// rather than imported: on Vercel, a function only ships the files its
// bundler can see, and importing that JSON from here crashed every endpoint
// that touches Firestore at load time (FUNCTION_INVOCATION_FAILED) while
// /api/health, which doesn't import it, kept working. If the project ever
// changes, update both places.
const firebaseConfig = {
  projectId: 'gen-lang-client-0416521853',
  firestoreDatabaseId: 'ai-studio-475ed658-5312-48f4-8175-70e280c700f8',
};

// Single place every /api file gets its firebase-admin app + Firestore
// client from — every file used to call initializeApp() independently,
// which meant credential handling had to be right in five separate places
// (and wasn't, anywhere). Importing this instead of calling initializeApp
// yourself guarantees exactly one initialization, with the same
// credentials, regardless of which endpoint happens to run first.
//
// Credential resolution:
//   1. FIREBASE_SERVICE_ACCOUNT_KEY env var (the full JSON key, as a
//      string) — set this on Vercel, since serverless functions have no
//      persistent filesystem to point GOOGLE_APPLICATION_CREDENTIALS at.
//   2. Otherwise, falls back to Application Default Credentials (picks up
//      GOOGLE_APPLICATION_CREDENTIALS locally, or the platform's own
//      metadata service on GCP/Cloud Run).
function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return undefined;
  try {
    return cert(JSON.parse(raw));
  } catch (err) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON:', err);
    return undefined;
  }
}

if (!getApps().length) {
  const credential = loadCredential();
  initializeApp({
    projectId: firebaseConfig.projectId,
    ...(credential ? { credential } : {}),
  });
}

// The client SDK connects to a named database, not "(default)" — see
// src/lib/firebase.ts. Always get Firestore through this export, never a
// bare getFirestore() (that connects to "(default)", a different, unused
// database — this exact bug shipped once already).
export const db = getFirestore(firebaseConfig.firestoreDatabaseId);

// Unlike the client SDK, the Admin SDK throws on `undefined` anywhere in a
// document by default (e.g. an optional `avatarUrl` left unset) instead of
// just omitting the field. Must be set before any other use of `db`.
db.settings({ ignoreUndefinedProperties: true });
