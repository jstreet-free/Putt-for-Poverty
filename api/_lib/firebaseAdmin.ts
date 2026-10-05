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
// Why the key couldn't be used, if it couldn't. Surfaced in error responses
// (see http.ts) so a misconfigured deployment says what's wrong instead of
// the generic "Could not load the default credentials". Never contains any
// part of the key itself.
export let credentialProblem: string | null = null;

function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString && ch === '\\') {
      out += ch + (text[++i] ?? '');
    } else if (ch === '"') {
      inString = !inString;
      out += ch;
    } else if (inString && ch === '\r') {
      if (text[i + 1] !== '\n') out += '\\n';
    } else if (inString && ch === '\n') {
      out += '\\n';
    } else if (inString && ch < ' ') {
      out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out;
}

// The parse error plus the text around it with every letter and digit
// masked, so the shape of the problem shows without revealing key material.
function describeJsonError(err: unknown, text: string): string {
  const reason = String(err instanceof Error ? err.message : err)
    .replace(/"[^"]*"/g, '…')
    .replace(/'[^']*'/g, '…');
  const position = Number(/position (\d+)/.exec(reason)?.[1]);
  if (!Number.isFinite(position)) return reason + '.';
  const mask = (s: string) => JSON.stringify(s.replace(/[A-Za-z0-9+/=]/g, 'x'));
  return `${reason}. Around there (letters/digits masked): ${mask(text.slice(Math.max(0, position - 40), position))} ` +
    `▶${mask(text.slice(position, position + 1))}◀ ${mask(text.slice(position + 1, position + 20))}.`;
}

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw || !raw.trim()) {
    credentialProblem = 'FIREBASE_SERVICE_ACCOUNT_KEY is not set for this deployment (check the environment it applies to, then redeploy).';
    return undefined;
  }

  // Tolerate the usual paste mistakes: surrounding whitespace, and the
  // quotes .env needs but a dashboard value box must not have.
  let text = raw.trim();
  if (text.length > 1 && (text[0] === "'" || text[0] === '"') && text[text.length - 1] === text[0]) {
    text = text.slice(1, -1).trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      // The private key's "\n" escapes are often turned into real line
      // breaks on the way into a dashboard, which JSON doesn't allow inside
      // a string. Re-escape them.
      parsed = JSON.parse(escapeControlCharsInStrings(text));
    } catch (err) {
      credentialProblem =
        `FIREBASE_SERVICE_ACCOUNT_KEY is set (${raw.length} chars) but is not valid JSON: ` +
        describeJsonError(err, text) +
        ' It should be the whole key file, starting with { and ending with }.';
      return undefined;
    }
  }

  if (parsed?.type !== 'service_account' || !parsed.private_key || !parsed.client_email) {
    credentialProblem = 'FIREBASE_SERVICE_ACCOUNT_KEY is JSON but not a service account key (missing type/private_key/client_email).';
    return undefined;
  }

  const pem = normalizePrivateKey(String(parsed.private_key));
  parsed.private_key = pem.key;

  try {
    return cert(parsed);
  } catch (err) {
    credentialProblem = `FIREBASE_SERVICE_ACCOUNT_KEY could not be loaded as a credential: ${err instanceof Error ? err.message : String(err)} (${pem.summary})`;
    return undefined;
  }
}

// A PEM key is base64 between two marker lines, so whatever a dashboard did
// to its line breaks (doubled "\n" escapes, CRLF, indentation), it can be
// rebuilt from the base64 alone. The summary describes the key's shape for
// diagnostics without any of its content.
function normalizePrivateKey(raw: string): { key: string; summary: string } {
  const match = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(raw);
  if (!match) {
    return { key: raw, summary: `private_key is ${raw.length} chars and lacks the BEGIN/END PRIVATE KEY lines` };
  }
  const body = match[1].replace(/\\[nr]/g, '').replace(/\s+/g, '');
  const unexpected = [...new Set(body.replace(/[A-Za-z0-9+/=]/g, ''))]
    .map((ch) => 'U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  const lines = body.match(/.{1,64}/g) ?? [];
  return {
    key: `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`,
    summary: `private_key is ${raw.length} chars; base64 body is ${body.length} chars` +
      (unexpected.length ? `, with unexpected characters ${unexpected.join(' ')}` : ''),
  };
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
