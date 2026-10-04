import { StandingRow } from '../../types';
import { formatToPar } from '../../lib/lobbyScoring';
import { Trophy } from 'lucide-react';

// Final (or live) standings in tournament form: position (T for ties), name,
// total strokes, and score to par. DNF players have no position and sit
// below everyone who finished. Results saved before to-par existed have no
// toPar/status, so those fields are shown only when present.
export function StandingsList({ standings, currentUserId }: {
  standings: Array<Partial<StandingRow> & Pick<StandingRow, 'userId' | 'name' | 'total'>>;
  currentUserId: string;
}) {
  const positions = standings.map((r) => r.position ?? null);
  const tied = new Set(
    positions.filter((p): p is number => p !== null)
      .filter((p, _, all) => all.filter((x) => x === p).length > 1)
  );

  return (
    <div className="space-y-2">
      {standings.map((row) => {
        const isMe = row.userId === currentUserId;
        const position = row.position ?? null;
        const label = position === null ? '—' : tied.has(position) ? `T${position}` : `${position}`;
        const isDnf = row.status === 'dnf';
        return (
          <div
            key={row.userId}
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 ${
              isMe ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
                position === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {position === 1 ? <Trophy size={13} /> : label}
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-800 text-sm truncate">{isMe ? 'You' : row.name}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">
                  {isDnf ? `DNF · ${row.holesPlayed ?? 0} holes` : `${row.total} strokes`}
                </div>
              </div>
            </div>
            {row.toPar !== undefined && !isDnf && (
              <div className={`text-lg font-black shrink-0 ${row.toPar < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                {formatToPar(row.toPar)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
