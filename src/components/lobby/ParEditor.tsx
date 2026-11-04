import { useEffect, useRef, useState } from 'react';
import { ClubRef, Lobby } from '../../types';
import { getPars, MAX_PAR, MIN_PAR, sumPars, validatePars } from '../../lib/lobbyScoring';
import { setLobbyPars } from '../../lib/lobbyService';
import { buildParTable, DetectedCourse } from '../../lib/clubLocator';
import { useClubDetection } from '../../hooks/useClubDetection';
import { ClubPicker, mapCoverageNote } from './ClubPicker';
import { Minus, Plus, Loader2, Save, MapPin } from 'lucide-react';

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

export interface ParDraft {
  pars: number[];
  club: ClubRef | null;
}

export const parDraftKey = (d: ParDraft) => `${d.pars.join(',')}|${d.club?.id ?? ''}`;

// A local draft of a par that lives on the server: edits stay local until
// saved, and while there are none the draft follows the server — the host,
// an admin, or the player on another device may change it meanwhile.
export function useParDraft(server: ParDraft) {
  const [draft, setDraft] = useState<ParDraft>(server);
  const serverKey = parDraftKey(server);
  const draftKey = parDraftKey(draft);
  const syncedKey = useRef(serverKey);

  useEffect(() => {
    if (draftKey === syncedKey.current) setDraft(server);
    syncedKey.current = serverKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  return { draft, setDraft, dirty: draftKey !== serverKey };
}

// A picked course's par, filled over `fallback` for holes the map doesn't
// have — plus a note saying how much of it really came from the map.
export function draftFromCourse(course: DetectedCourse, holes: 9 | 18, fallback: number[]): { draft: ParDraft; note: string; fromMap: number } {
  const { pars, fromMap } = buildParTable(course.holePars, holes, fallback);
  return { draft: { pars, club: { id: course.id, name: course.name } }, note: mapCoverageNote(fromMap, holes), fromMap };
}

// The host's control for the event's par — what every player who hasn't set
// their own plays to — before or during the event. "Find my club" fills it
// from the course the host is standing on.
export function HostParPanel({ lobby }: { lobby: Lobby }) {
  const { draft, setDraft, dirty } = useParDraft({ pars: getPars(lobby), club: lobby.club ?? null });
  const detection = useClubDetection();
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handlePick = (course: DetectedCourse) => {
    const picked = draftFromCourse(course, lobby.holes, getPars(lobby));
    setDraft(picked.draft);
    setNote(picked.note);
  };

  const handleSave = async () => {
    const validation = validatePars(draft.pars, lobby.holes);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError(null);
    try {
      await setLobbyPars(lobby.id, draft.pars, draft.club);
      setNote(null);
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
        <div className="text-xs font-black text-slate-700 uppercase tracking-widest">Event par</div>
        {dirty && <span className="text-[10px] font-black text-amber-600 uppercase">Unsaved changes</span>}
      </div>
      <p className="text-xs text-slate-500 font-medium">
        Everyone plays to this unless they've set their own par for the club they're at — they keep theirs.
      </p>
      <ClubPicker detection={detection} holes={lobby.holes} selectedId={draft.club?.id ?? null} onPick={handlePick} />
      {draft.club && (
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
          <span className="flex items-center gap-1.5 min-w-0 truncate"><MapPin size={12} className="text-emerald-500 shrink-0" />{draft.club.name}</span>
          <button type="button" onClick={() => setDraft({ ...draft, club: null })} className="text-slate-400 hover:text-slate-600 shrink-0">Clear</button>
        </div>
      )}
      {note && <p className="text-xs font-bold text-emerald-700">{note}</p>}
      <ParEditor holes={lobby.holes} value={draft.pars} onChange={(pars) => setDraft({ ...draft, pars })} />
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-800 transition-colors disabled:opacity-40"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saved ? 'Par saved' : saving ? 'Saving...' : `Save event par (${sumPars(draft.pars)})`}
      </button>
    </div>
  );
}
