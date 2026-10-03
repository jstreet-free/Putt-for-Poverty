import { useEffect, useState } from 'react';
import { Lobby } from '../../types';
import { getPars, MAX_PAR, MIN_PAR, validatePars } from '../../lib/lobbyScoring';
import { setLobbyPars } from '../../lib/lobbyService';
import { Minus, Plus, Loader2, Save } from 'lucide-react';

// Par for each hole, as a grid of steppers. Controlled: the parent owns the
// array. Used by the host when creating a lobby and while it's running.
export function ParEditor({ holes, value, onChange }: {
  holes: 9 | 18;
  value: number[];
  onChange: (pars: number[]) => void;
}) {
  const total = value.reduce((sum, p) => sum + p, 0);
  const setHole = (index: number, next: number) => {
    const clamped = Math.min(MAX_PAR, Math.max(MIN_PAR, next));
    onChange(value.map((p, i) => (i === index ? clamped : p)));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {value.map((par, index) => (
          <div key={index} className="bg-white border-2 border-slate-100 rounded-xl p-2 text-center space-y-1">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hole {index + 1}</div>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setHole(index, par - 1)}
                disabled={par <= MIN_PAR}
                className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 disabled:opacity-30"
              >
                <Minus size={12} />
              </button>
              <span className="text-lg font-black text-slate-900">{par}</span>
              <button
                type="button"
                onClick={() => setHole(index, par + 1)}
                disabled={par >= MAX_PAR}
                className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 disabled:opacity-30"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs font-bold text-slate-500 text-center">
        {holes}-hole course · par {total}
      </div>
    </div>
  );
}

// The host's control for changing par during a scheduled or live event.
// Keeps a local draft so the host can adjust several holes before saving,
// and only re-syncs from the server when they haven't got unsaved edits.
export function HostParPanel({ lobby }: { lobby: Lobby }) {
  const serverPars = getPars(lobby);
  const [draft, setDraft] = useState<number[]>(serverPars);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const serverKey = serverPars.join(',');
  const draftKey = draft.join(',');
  const dirty = serverKey !== draftKey;

  useEffect(() => {
    if (!dirty) setDraft(serverPars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const handleSave = async () => {
    const validation = validatePars(draft, lobby.holes);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError(null);
    try {
      await setLobbyPars(lobby.id, draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the par.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-black text-slate-700 uppercase tracking-widest">Course par</div>
        {dirty && <span className="text-[10px] font-black text-amber-600 uppercase">Unsaved changes</span>}
      </div>
      <ParEditor holes={lobby.holes} value={draft} onChange={setDraft} />
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-800 transition-colors disabled:opacity-40"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saved ? 'Par saved' : saving ? 'Saving...' : 'Save par'}
      </button>
    </div>
  );
}
