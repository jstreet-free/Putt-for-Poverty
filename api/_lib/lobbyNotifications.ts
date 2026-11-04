import { getMessaging } from 'firebase-admin/messaging';
import { db } from './admin.js';
import { NotificationState, planNotifications, REMINDER_BODY } from './notificationPlan.js';

// A notification about a round is stale once the moment has passed.
const PUSH_TTL_SECONDS = 600;

// FCM's answer for a device that uninstalled or revoked permission.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

interface Push {
  title: string;
  body: string;
  tag: string;
  url: string;
}

// Data-only on purpose: public/sw.js is the one place that shows a
// notification, so a message can't be displayed twice.
async function sendPush(userIds: string[], push: Push): Promise<void> {
  if (!userIds.length) return;

  const snaps = await Promise.all(
    userIds.map((uid) => db.collection('pushTokens').where('uid', '==', uid).get()),
  );
  const tokenDocs = snaps.flatMap((snap) => snap.docs);
  if (!tokenDocs.length) return;

  const { responses } = await getMessaging().sendEach(tokenDocs.map((tokenDoc) => ({
    token: tokenDoc.id,
    data: { ...push },
    webpush: { headers: { Urgency: 'high', TTL: String(PUSH_TTL_SECONDS) } },
  })));

  await Promise.all(responses.map(async (response, i) => {
    if (!response.error) return;
    if (DEAD_TOKEN_CODES.has(response.error.code)) {
      await tokenDocs[i].ref.delete();
    } else {
      console.warn(`Push failed (${response.error.code}): ${response.error.message}`);
    }
  }));
}

// Sends whatever is due for one lobby. Safe to call at any time and from
// several places at once: the state update in the transaction is what claims
// a notification, so it goes out once however many runs overlap.
export async function processLobby(lobbyId: string): Promise<void> {
  const lobbyRef = db.collection('lobbies').doc(lobbyId);
  const [lobbySnap, membersSnap, cardsSnap] = await Promise.all([
    lobbyRef.get(),
    lobbyRef.collection('members').get(),
    lobbyRef.collection('scorecards').get(),
  ]);

  const lobby = lobbySnap.data();
  if (!lobby || lobby.status !== 'live') return;

  const members = membersSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name,
    chargeStatus: d.data().chargeStatus,
    chargedAtMs: d.data().chargedAt?.toMillis?.(),
    pars: d.data().pars,
  }));
  const cards = cardsSnap.docs.map((d) => ({
    userId: d.id,
    strokes: d.data().strokes || {},
    updatedAtMs: d.data().updatedAt?.toMillis?.() ?? 0,
  }));

  // Lives under the lobby so deleting the lobby removes it. No rule matches
  // this path, so firestore.rules leaves it admin-read only.
  const stateRef = lobbyRef.collection('notifications').doc('state');
  const plan = await db.runTransaction(async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const next = planNotifications({
      nowMs: Date.now(),
      startedAtMs: lobby.startedAt.toMillis(),
      lobby: { holes: lobby.holes, pars: lobby.pars },
      members,
      cards,
      state: (stateSnap.data() as NotificationState | undefined) ?? null,
    });
    if (next.stateChanged) tx.set(stateRef, next.state);
    return next;
  });

  const url = `/lobbies?lobby=${lobbyId}`;
  await Promise.all([
    ...plan.scores.map(({ userId, body }) => sendPush(
      members.map((m) => m.id).filter((uid) => uid !== userId),
      { title: lobby.name, body, tag: `score-${userId}`, url },
    )),
    sendPush(plan.reminders, { title: lobby.name, body: REMINDER_BODY, tag: `reminder-${lobbyId}`, url }),
  ]);
}
