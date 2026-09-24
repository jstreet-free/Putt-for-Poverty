import { useEffect, useState } from 'react';
import { Scorecard, StandingRow } from '../../types';
import { subscribeToScorecards } from '../../lib/lobbyService';
import { rankScorecards } from '../../lib/lobbyScoring';
import { Trophy } from 'lucide-react';

export function LobbyLeaderboard({ lobbyId, currentUserId }: { lobbyId: string; currentUserId: string }) {
  const [cards, setCards] = useState<Scorecard[]>([]);

  useEffect(() => {
    const unsub = subscribeToScorecards(lobbyId, setCards, (err) =>
      console.warn(`Could not load scorecards for lobby ${lobbyId}:`, err)
    );
    return () => unsub();
  }, [lobbyId]);

  const standings: StandingRow[] = rankScorecards(cards);

  if (standings.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm font-bold">
        No scores yet — first strokes will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {standings.map((row) => (
        <div
          key={row.userId}
          className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 ${
            row.userId === currentUserId ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
              row.position === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {row.position === 1 ? <Trophy size={13} /> : row.position}
            </div>
            <div className="min-w-0">
              <div className="font-black text-slate-800 text-sm truncate">
                {row.userId === currentUserId ? 'You' : row.name}
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">{row.holesPlayed} holes played</div>
            </div>
          </div>
          <div className="text-lg font-black text-slate-900 shrink-0">{row.total}</div>
        </div>
      ))}
    </div>
  );
}
