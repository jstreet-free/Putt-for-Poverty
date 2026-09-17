import { getAuth } from 'firebase-admin/auth';

export interface VerifiedCaller {
  uid: string;
  email: string | null;
}

// Verifies the Firebase ID token sent by the client and returns the caller's
// real uid/email. Never trust a uid/email taken from the request body for
// anything security-sensitive (payment crediting, role changes, etc.) —
// those are attacker-controlled unless they come from a verified token.
export async function verifyCaller(req: any): Promise<VerifiedCaller | null> {
  const authHeader: string | undefined = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email || null };
  } catch {
    return null;
  }
}
