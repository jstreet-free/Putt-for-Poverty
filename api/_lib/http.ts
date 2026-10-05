import { credentialProblem } from './firebaseAdmin.js';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendError(res: any, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error.';
  // A credentials failure is almost always configuration, so say which part.
  const detail = credentialProblem && /credential|UNAUTHENTICATED/i.test(message) ? ` [${credentialProblem}]` : '';
  return res.status(500).json({ error: message + detail });
}
