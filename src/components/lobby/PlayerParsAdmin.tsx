import { useState } from 'react';
import { Lobby, LobbyMember } from '../../types';
import { getPars, getPlayerPars, hasOwnPars, sumPars, validatePars } from '../../lib/lobbyScoring';
import { applyParsToEveryone, setPlayerPars } from '../../lib/lobbyService';
import { ParEditor, useParDraft } from './ParEditor';
import { ChevronDown, ChevronUp, Loader2, MapPin, ShieldCheck, Users } from 'lucide-react';

// Admin only: the par every player in the event is playing to, with a way
// to change any one of them or put the whole field on one par at once.
export function PlayerParsAdmin({ lobby, members }: { lobby: Lobby; members: LobbyMember[] }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const customCount = members.filter((m) => hasOwnPars(lobby, m)).length;

  return (
    <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-blue-700"
      >
        <span className="flex items-center gap-2 font-black text-xs uppercase tracking-widest">
          <ShieldCheck size={14} />
          Players' par (admin)
        </span>
        <span className="flex items-center gap-2 text-[10px] font-black uppercase">
          {customCount > 0 ? `${customCount} on their own par` : 'All on event par'}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <>
          <EveryoneParForm lobby={lobby} playerCount={members.length} customCount={customCount} />
          <div className="space-y-2">
            {members.map((m) => (
              <PlayerParRow
                key={m.id}
                lobby={lobby}
                member={m}
                editing={editingId === m.id}
                onToggle={() => setEditingId((id) => (id === m.id ? null : m.id))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EveryoneParForm({ lobby, playerCount, customCount }: { lobby: Lobby; playerCount: number; customCount: number }) {
  const { draft, setDraft } = useParDraft({ pars: getPars(lobby), club: lobby.club ?? null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleApply = async () => {
    const validation = validatePars(draft.pars, lobby.holes);
    if (validation) { setError(validation); return; }
    const overriding = customCount > 0 ? ` ${customCount} player(s) on their own par will be switched to it.` : '';
    if (!confirm(`Set par ${sumPars(draft.pars)} for all ${playerCount} players in this event?${overriding}`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await applyParsToEveryone(lobby.id, draft.pars, draft.club);
      setNotice(`Everyone is now on par ${sumPars(draft.pars)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the par for everyone.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border-2 border-blue-100 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-widest">
        <Users size={13} />
        Same par for everyone
      </div>
      <ParEditor holes={lobby.holes} value={draft.pars} onChange={(pars) => setDraft({ ...draft, pars })} />
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      {notice && <p className="text-xs font-bold text-emerald-700">{notice}</p>}
      <button
        type="button"
        onClick={handleApply}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-2.5 rounded-xl font-black text-xs uppercase hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? 'Applying...' : `Apply par ${sumPars(draft.pars)} to everyone`}
      </button>
    </div>
  );
}

function PlayerParRow({ lobby, member, editing, onToggle }: {
  lobby: Lobby;
  member: LobbyMember;
  editing: boolean;
  onToggle: () => void;
}) {
  const own = hasOwnPars(lobby, member);
  const current = getPlayerPars(lobby, member);
  const { draft, setDraft, dirty } = useParDraft({ pars: current, club: own ? member.club ?? null : null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (pars: number[] | null) => {
    if (pars) {
      const validation = validatePars(pars, lobby.holes);
      if (validation) { setError(validation); return; }
    }
    setBusy(true);
    setError(null);
    try {
      await setPlayerPars(lobby.id, member.id, pars, pars ? draft.club : null);
      onToggle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this player's par.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border-2 border-slate-100 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-black text-slate-800 text-sm truncate">{member.name}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 truncate">
            {own && <MapPin size={10} className="text-emerald-500 shrink-0" />}
            {own ? member.club?.name || 'Own par' : 'Event par'} · {sumPars(current)}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase hover:bg-slate-200 transition-colors"
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="space-y-3">
          <ParEditor holes={lobby.holes} value={draft.pars} onChange={(pars) => setDraft({ ...draft, pars })} />
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <div className="flex gap-2">
            {own && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy}
                className="flex-1 bg-slate-100 text-slate-600 p-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Back to event par
              </button>
            )}
            <button
              type="button"
              onClick={() => save(draft.pars)}
              disabled={busy || !dirty}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 text-white p-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Save {member.name.split(' ')[0]}'s par
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
