import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { saveStrokes } from '../../lib/lobbyService';
import { Minus, Plus, Loader2, Eye } from 'lucide-react';

const SAVE_DEBOUNCE_MS = 600;

export function Scorecard({ lobbyId, holes, player, isSpectator }: {
  lobbyId: string;
  holes: 9 | 18;
  player: { uid: string; name: string; avatarUrl?: string };
  isSpectator: boolean;
}) {
  const [strokes, setStrokes] = useState<Record<string, number>>({});
  const [activeHole, setActiveHole] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, 'lobbies', lobbyId, 'scorecards', player.uid))
      .then((snap) => {
        if (!active) return;
        const data = snap.data();
        if (data?.strokes && typeof data.strokes === 'object') setStrokes(data.strokes);
      })
      .catch((err) => console.warn('Could not load your scorecard:', err))
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [lobbyId, player.uid]);

  useEffect(() => {
    if (!loaded || isSpectator) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      saveStrokes(lobbyId, player, strokes)
        .catch((err) => console.warn('Could not save strokes:', err))
        .finally(() => setSaving(false));
    }, SAVE_DEBOUNCE_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, loaded, isSpectator]);

  const total = Object.values(strokes).reduce((sum, v) => (Number.isInteger(v) && v > 0 ? sum + v : sum), 0);
  const holesPlayed = Object.values(strokes).filter(v => Number.isInteger(v) && v > 0).length;
  const holeNumbers = Array.from({ length: holes }, (_, i) => i + 1);

  const setHoleStrokes = (hole: number, value: number) => {
    const clamped = Math.min(15, Math.max(1, value));
    setStrokes((prev) => ({ ...prev, [String(hole)]: clamped }));
  };

  if (isSpectator) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center space-y-2">
        <Eye size={22} className="mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-500">
          You're viewing this event as a spectator (no credit was available when it started).
        </p>
        <p className="text-xs text-slate-400 font-medium">You can watch the leaderboard and map, but can't submit strokes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {holeNumbers.map((hole) => {
          const played = strokes[String(hole)] > 0;
          return (
            <button
              key={hole}
              onClick={() => setActiveHole(hole)}
              className={`shrink-0 w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center transition-colors ${
                activeHole === hole
                  ? 'bg-emerald-600 text-white'
                  : played
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {hole}
            </button>
          );
        })}
      </div>

      <div className="bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-6 flex items-center justify-between">
        <button
          onClick={() => setHoleStrokes(activeHole, (strokes[String(activeHole)] || 4) - 1)}
          className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 transition-colors"
        >
          <Minus size={20} />
        </button>
        <div className="text-center">
          <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Hole {activeHole}</div>
          <div className="text-5xl font-black text-emerald-900">{strokes[String(activeHole)] || '-'}</div>
          <div className="text-[10px] font-bold text-emerald-500 uppercase">Strokes</div>
        </div>
        <button
          onClick={() => setHoleStrokes(activeHole, (strokes[String(activeHole)] || 3) + 1)}
          className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 transition-colors"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-400">{holesPlayed} of {holes} holes played</span>
        <span className="flex items-center gap-2 text-sm font-black text-slate-800">
          {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
          Total: {total}
        </span>
      </div>
    </div>
  );
}
