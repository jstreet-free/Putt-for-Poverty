import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { HistoryEntry } from '../types';
import { Trophy, Calendar, Flag, ChevronDown, Eye, History as HistoryIcon } from 'lucide-react';
import { StandingsList } from '../components/lobby/StandingsList';
import { formatToPar } from '../lib/lobbyScoring';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';

// Results saved before myStatus existed only know whether there was a place.
function historyStatus(h: HistoryEntry): 'finished' | 'dnf' | 'spectator' {
  if (h.myStatus === 'dnf') return 'dnf';
  if (h.myStatus === 'spectator') return 'spectator';
  if (h.myStatus === undefined && h.myPosition === null) return 'spectator';
  return 'finished';
}

function formatDate(value: any): string {
  const d = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!d || isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MyRounds({ user }: { user: FirebaseUser | null }) {
  const [searchParams] = useSearchParams();
  const [rounds, setRounds] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(() => searchParams.get('round'));
  const scrolledToDeepLink = useRef(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const q = query(collection(db, 'users', user.uid, 'history'), orderBy('finishedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRounds(snap.docs.map(d => ({ ...d.data() } as HistoryEntry)));
      setLoading(false);
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'history');
    });
    return () => unsub();
  }, [user]);

  // Scrolls a round opened via a deep link (?round=<lobbyId>, e.g. from the
  // account page's Match History) into view once it's rendered — only once,
  // so it doesn't keep yanking the page back if the user scrolls away.
  useEffect(() => {
    const roundId = searchParams.get('round');
    if (!roundId || loading || scrolledToDeepLink.current) return;
    const el = itemRefs.current[roundId];
    if (el) {
      scrolledToDeepLink.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchParams, loading, rounds]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
          <HistoryIcon size={14} />
          Your Finished Rounds
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">MY <span className="text-blue-600">ROUNDS</span></h1>
        <p className="text-slate-500 font-medium">Every lobby event you've taken part in, with the final standings.</p>
      </div>

      {loading ? (
        <div className="p-24 text-center text-slate-400 font-bold">Loading...</div>
      ) : rounds.length === 0 ? (
        <div className="p-24 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 space-y-3">
          <Trophy size={40} className="mx-auto text-blue-200" />
          <p className="text-xl font-black text-slate-700">No finished rounds yet</p>
          <p className="text-slate-400 font-medium">Join or start a lobby to see your results here once it's over.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rounds.map((round) => {
            const expanded = expandedId === round.lobbyId;
            const status = historyStatus(round);
            const isSpectator = status === 'spectator';
            return (
              <motion.div
                key={round.lobbyId}
                ref={(el) => { itemRefs.current[round.lobbyId] = el; }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-[2rem] border-2 shadow-md overflow-hidden transition-colors ${
                  expanded && searchParams.get('round') === round.lobbyId ? 'border-emerald-200' : 'border-slate-100'
                }`}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : round.lobbyId)}
                  className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black ${
                      isSpectator || status === 'dnf' ? 'bg-slate-100 text-slate-400' : round.myPosition === 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {isSpectator ? <Eye size={20} /> : status === 'dnf' ? (
                        <span className="text-xs leading-none">DNF</span>
                      ) : (
                        <>
                          <span className="text-[9px] uppercase tracking-widest opacity-70">Place</span>
                          <span className="text-xl leading-none">{round.myPosition}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 text-lg truncate">{round.lobbyName}</div>
                      <div className="text-xs text-slate-400 font-bold flex items-center gap-3">
                        <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(round.finishedAt)}</span>
                        <span className="flex items-center gap-1"><Flag size={11} />{round.holes} holes</span>
                        <span>{round.playerCount} player{round.playerCount === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!isSpectator && status !== 'dnf' && (
                      <div className="text-right">
                        <div className="text-2xl font-black text-slate-900">
                          {round.myToPar !== undefined && round.myToPar !== null ? formatToPar(round.myToPar) : round.myTotal}
                        </div>
                        {round.myTotal !== null && round.myTotal !== undefined && (
                          <div className="text-[10px] font-bold text-slate-400 uppercase">{round.myTotal} strokes</div>
                        )}
                      </div>
                    )}
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0">
                        <StandingsList standings={round.standings} currentUserId={user?.uid ?? ''} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
