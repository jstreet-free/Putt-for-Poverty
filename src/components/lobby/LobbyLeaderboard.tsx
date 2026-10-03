import { useEffect, useMemo, useState } from 'react';
import { Scorecard } from '../../types';
import { subscribeToScorecards } from '../../lib/lobbyService';
import { formatToPar, rankScorecards, tallyStrokes } from '../../lib/lobbyScoring';
import { Trophy } from 'lucide-react';

export function LobbyLeaderboard({ lobbyId, holes, pars, currentUserId }: {
  lobbyId: string;
  holes: 9 | 18;
  pars: number[];
  currentUserId: string;
}) {
  const [cards, setCards] = useState<Scorecard[]>([]);

  useEffect(() => {
    const unsub = subscribeToScorecards(lobbyId, setCards, (err) =>
      console.warn(`Could not load scorecards for lobby ${lobbyId}:`, err)
    );
    return () => unsub();
  }, [lobbyId]);

  const standings = useMemo(() => {
    const tallies = cards.map((card) => ({
      userId: card.userId,
      name: card.name,
      avatarUrl: card.avatarUrl,
      ...tallyStrokes(card.strokes || {}, pars, holes),
    }));
    return rankScorecards(tallies, holes, 'live');
  }, [cards, pars, holes]);

  // A shared position (T2) is shown with a "T" prefix, as on a real board.
  const tiedPositions = useMemo(() => {
    const counts = new Map<number, number>();
    standings.forEach((row) => {
      if (row.position !== null) counts.set(row.position, (counts.get(row.position) ?? 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([p]) => p));
  }, [standings]);

  if (standings.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm font-bold">
        No scores yet — first strokes will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {standings.map((row) => {
        const isMe = row.userId === currentUserId;
        const label = row.position === null
          ? '—'
          : tiedPositions.has(row.position) ? `T${row.position}` : `${row.position}`;
        const thru = row.status === 'finished' ? 'F'
          : row.status === 'playing' ? `Thru ${row.holesPlayed}`
          : row.status === 'dnf' ? 'DNF'
          : '—';
        return (
          <div
            key={row.userId}
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 ${
              isMe ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
                row.position === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {row.position === 1 ? <Trophy size={13} /> : label}
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-800 text-sm truncate">
                  {isMe ? 'You' : row.name}
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">{thru} · {row.total} strokes</div>
              </div>
            </div>
            <div className={`text-lg font-black shrink-0 ${
              row.status === 'not_started' ? 'text-slate-300' : row.toPar < 0 ? 'text-emerald-600' : 'text-slate-900'
            }`}>
              {row.status === 'not_started' ? '—' : formatToPar(row.toPar)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
