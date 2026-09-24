// Keep this in sync with src/lib/lobbyScoring.ts — duplicated (not imported)
// because /api endpoints run as separate Vercel serverless functions built
// independently of the Vite client bundle, and the two build pipelines
// aren't set up to share source across the api/ and src/ boundary.
export interface ScorecardLike {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;
  holesPlayed: number;
}

export interface StandingRowLike {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;
  holesPlayed: number;
  position: number;
}

export function rankScorecards(cards: ScorecardLike[]): StandingRowLike[] {
  const sorted = [...cards].sort((a, b) => {
    if (b.holesPlayed !== a.holesPlayed) return b.holesPlayed - a.holesPlayed;
    if (a.total !== b.total) return a.total - b.total;
    return a.name.localeCompare(b.name);
  });

  const rows: StandingRowLike[] = [];
  let position = 0;
  let prev: ScorecardLike | null = null;

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
