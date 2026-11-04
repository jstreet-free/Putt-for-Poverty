import { formatToPar, getPlayerPars, tallyStrokes } from './scoring.js';

// Decides which lobby notifications are due. Pure (no Firebase) so it can be
// tested directly; api/_lib/lobbyNotifications.ts does the reads and sends.

// A hole takes about 13 minutes (18 in 4 hours), so a player entering scores
// as they go never reaches this; only one who has forgotten does.
export const QUIET_MS = 15 * 60 * 1000;

// A player correcting a hole shouldn't buzz everyone twice. A change inside
// this gap stays pending and goes out on a later run, as the latest score.
export const SCORE_PUSH_GAP_MS = 30 * 1000;

export const REMINDER_BODY = "You haven't entered a score in a while. If you've finished a hole, add it now.";

export interface PlayerState {
  // What was last announced, and when.
  strokes: string;
  sentAtMs: number;
  // When their score last really changed.
  lastChangeMs: number;
  // The lastChangeMs a reminder already went out for: one per quiet spell.
  remindedForMs: number | null;
}

export interface NotificationState {
  players: Record<string, PlayerState>;
}

export interface PlanInput {
  nowMs: number;
  startedAtMs: number;
  lobby: { holes: 9 | 18; pars?: number[] };
  members: { id: string; name: string; chargeStatus?: string; chargedAtMs?: number; pars?: number[] }[];
  cards: { userId: string; strokes: Record<string, number>; updatedAtMs: number }[];
  state: NotificationState | null;
}

export interface Plan {
  scores: { userId: string; body: string }[];
  // The players to remind, each about their own card.
  reminders: string[];
  state: NotificationState;
  stateChanged: boolean;
}

// Scorecard re-saves the card whenever it opens, so updatedAt moving doesn't
// mean a score changed. Only a different set of strokes counts.
function strokesKey(strokes: Record<string, number>): string {
  return Object.keys(strokes).sort().map((hole) => `${hole}:${strokes[hole]}`).join(',');
}

function scoreBody(name: string, toPar: number, holesPlayed: number, holes: number): string {
  return holesPlayed >= holes
    ? `${name} finished at ${formatToPar(toPar)}`
    : `${name} is ${formatToPar(toPar)} thru ${holesPlayed}`;
}

export function planNotifications({ nowMs, startedAtMs, lobby, members, cards, state }: PlanInput): Plan {
  const players = { ...state?.players };
  const scores: Plan['scores'] = [];
  const reminders: string[] = [];
  let stateChanged = false;

  // Spectators can't score, so there's nothing to announce or remind them of.
  for (const member of members.filter((m) => m.chargeStatus === 'charged')) {
    const card = cards.find((c) => c.userId === member.id);
    const cardStrokes = card?.strokes ?? {};
    const { total, parPlayed, holesPlayed } = tallyStrokes(cardStrokes, getPlayerPars(lobby, member), lobby.holes);

    const player: PlayerState = players[member.id] ?? {
      strokes: '',
      sentAtMs: 0,
      // A late joiner's clock starts when they join, not when the event did.
      lastChangeMs: Math.max(startedAtMs, member.chargedAtMs ?? 0),
      remindedForMs: null,
    };
    let playerChanged = false;

    const strokes = strokesKey(cardStrokes);
    if (card && strokes !== player.strokes) {
      playerChanged = true;
      player.lastChangeMs = Math.max(player.lastChangeMs, card.updatedAtMs);
      if (nowMs - player.sentAtMs >= SCORE_PUSH_GAP_MS) {
        player.strokes = strokes;
        player.sentAtMs = nowMs;
        scores.push({ userId: member.id, body: scoreBody(member.name, total - parPlayed, holesPlayed, lobby.holes) });
      }
    }

    if (holesPlayed < lobby.holes
      && nowMs - player.lastChangeMs >= QUIET_MS
      && player.remindedForMs !== player.lastChangeMs) {
      playerChanged = true;
      player.remindedForMs = player.lastChangeMs;
      reminders.push(member.id);
    }

    if (playerChanged) {
      players[member.id] = player;
      stateChanged = true;
    }
  }

  return { scores, reminders, state: { players }, stateChanged };
}
