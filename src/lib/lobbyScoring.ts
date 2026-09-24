import { Scorecard, StandingRow } from '../types';

// Ranks by holes played (more is better — an unfinished round shouldn't beat
// a finished one just on a lower total), then total strokes ascending, then
// name as a stable tiebreaker. Ties share a position (1, 1, 3 — not 1, 2, 3).
//
// This is the single place ranking logic lives so a future scoring format
// (Stableford points, handicap-adjusted net score, etc.) only needs to change
// here. Keep this in sync with api/_lib/scoring.ts, which duplicates this
// logic for the server — see the comment there for why it isn't shared.
export function rankScorecards(cards: Scorecard[]): StandingRow[] {
  const sorted = [...cards].sort((a, b) => {
    if (b.holesPlayed !== a.holesPlayed) return b.holesPlayed - a.holesPlayed;
    if (a.total !== b.total) return a.total - b.total;
    return a.name.localeCompare(b.name);
  });

  const rows: StandingRow[] = [];
  let position = 0;
  let prev: Scorecard | null = null;

  sorted.forEach((card, index) => {
    if (!prev || card.holesPlayed !== prev.holesPlayed || card.total !== prev.total) {
      position = index + 1;
    }
    rows.push({
      userId: card.userId,
      name: card.name,
      avatarUrl: card.avatarUrl,
      total: card.total,
      holesPlayed: card.holesPlayed,
      position,
    });
    prev = card;
  });

  return rows;
}
