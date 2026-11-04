import { verifyCaller } from './_lib/auth.js';
import { db } from './_lib/admin.js';
import { HttpError, sendError } from './_lib/http.js';
import { processLobby } from './_lib/lobbyNotifications.js';

// One endpoint for both callers, because Vercel's free tier allows 12
// functions and this is the twelfth.
//   - The scheduler, every minute, with CRON_SECRET: every live lobby. This
//     is what notices silence, and it picks up anything a phone didn't send.
//   - A lobby member, right after saving a score: just their lobby, so score
//     notifications go out immediately instead of on the next minute.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers?.authorization === `Bearer ${cronSecret}`) {
      const live = await db.collection('lobbies').where('status', '==', 'live').get();
      const results = await Promise.allSettled(live.docs.map((d) => processLobby(d.id)));
      const errors = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason?.message ?? r.reason)] : []));
      errors.forEach((message) => console.error('Lobby notifications failed:', message));
      return res.status(200).json({ lobbies: live.size, errors });
    }

    const caller = await verifyCaller(req);
    if (!caller) throw new HttpError(401, 'Unauthorized');

    const { lobbyId } = req.body || {};
    if (typeof lobbyId !== 'string' || !lobbyId) {
      throw new HttpError(400, 'lobbyId is required.');
    }

    const member = await db.collection('lobbies').doc(lobbyId).collection('members').doc(caller.uid).get();
    if (!member.exists) throw new HttpError(403, 'You are not in this lobby.');

    await processLobby(lobbyId);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
