import { credentialProblem } from './_lib/firebaseAdmin.js';

// Reports whether the Firebase key loaded (never any part of the key), so a
// misconfigured deployment can be diagnosed without signing in.
export default function handler(req: any, res: any) {
  res.status(200).json({ status: "ok", firebaseCredential: credentialProblem ?? "loaded" });
}
