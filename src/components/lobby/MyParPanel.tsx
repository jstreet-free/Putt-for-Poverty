import { useEffect, useMemo, useState } from 'react';
import { Lobby, LobbyMember } from '../../types';
import { getPars, getPlayerPars, hasOwnPars, sumPars, validatePars } from '../../lib/lobbyScoring';
import { setPlayerPars } from '../../lib/lobbyService';
import { DetectedCourse, formatDistance } from '../../lib/clubLocator';
import { useClubDetection } from '../../hooks/useClubDetection';
import { ClubPicker } from './ClubPicker';
import { draftFromCourse, ParEditor, useParDraft } from './ParEditor';
import { Loader2, MapPin, Save, X } from 'lucide-react';

// The player's own par. Everyone plays to the event's par unless they set
// their own — for when they're at a different club from the rest of the
// field. Only ever changes this player's card.
//
// With `autoDetect` (a live event, when they're on the course) their club is
// looked up from their location as soon as this mounts, and if its par
// differs from what they're playing to they're offered it in one tap. It is
// never applied without them saying so: their score to par would jump.
export function MyParPanel({ lobby, member, autoDetect }: {
  lobby: Lobby;
  member: LobbyMember;
  autoDetect: boolean;
}) {
  const own = hasOwnPars(lobby, member);
  const current = getPlayerPars(lobby, member);
  const eventPars = getPars(lobby);
  const { draft, setDraft, dirty } = useParDraft({ pars: current, club: own ? member.club ?? null : null });
  const detection = useClubDetection();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoDetect && !own) detection.detect();
    // Once, when the panel first appears — "Search again" is there for more.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The club the lookup found, and what its par would mean for this player.
  // Only a par that's on the map and differs from theirs is worth offering.
  const best = detection.status === 'done' ? detection.courses[0] : undefined;
  const currentKey = current.join(',');
  const found = useMemo(() => {
    if (!best || own) return null;
    const picked = draftFromCourse(best, lobby.holes, eventPars);
    return {
      course: best,
      ...picked,
      complete: picked.fromMap === lobby.holes,
      sameAsCurrent: picked.draft.pars.join(',') === currentKey,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, own, currentKey, lobby.holes]);
  const suggestion = found && !dismissed && found.fromMap > 0 && !found.sameAsCurrent ? found : null;

  const save = async (pars: number[] | null, club = draft.club) => {
    if (pars) {
      const validation = validatePars(pars, lobby.holes);
      if (validation) { setError(validation); return; }
    }
    setSaving(true);
    setError(null);
    try {
      await setPlayerPars(lobby.id, member.id, pars, pars ? club : null);
      setOpen(false);
      setNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your par.');
    } finally {
      setSaving(false);
    }
  };

  const pick = (course: DetectedCourse) => {
    const picked = draftFromCourse(course, lobby.holes, eventPars);
    setDraft(picked.draft);
    setNote(picked.note);
  };

  // A complete map par is one tap; a partial one opens the editor to check.
  const acceptSuggestion = () => {
    if (!suggestion) return;
    if (suggestion.complete) {
      save(suggestion.draft.pars, suggestion.draft.club);
    } else {
      setDraft(suggestion.draft);
      setNote(suggestion.note);
      setOpen(true);
    }
  };

  const label = own
    ? member.club?.name || 'Your own par'
    : lobby.club?.name ? `Event par · ${lobby.club.name}` : 'Event par';

  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your par</div>
          <div className="font-black text-slate-800 text-sm truncate flex items-center gap-1.5">
            {own && <MapPin size={12} className="text-emerald-500 shrink-0" />}
            {label} · {sumPars(current)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setError(null); }}
          className="shrink-0 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase hover:bg-slate-200 transition-colors"
        >
          {open ? 'Close' : 'Change'}
        </button>
      </div>

      {!open && detection.status === 'working' && (
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Loader2 size={12} className="animate-spin" /> Finding your club...
        </div>
      )}

      {!open && found && !suggestion && (
        <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 truncate">
          <MapPin size={10} className="text-emerald-500 shrink-0" />
          {found.course.inside ? "You're at" : 'Nearest club:'} {found.course.name}
          {found.fromMap === 0 ? ' — no par on the map, tap Change to set it' : found.sameAsCurrent ? ' — same par as yours' : ''}
        </div>
      )}

      {!open && suggestion && (
        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-emerald-800">
              {suggestion.course.inside ? "You're at " : `Nearest club (${formatDistance(suggestion.course.distanceM)}): `}
              <span className="font-black">{suggestion.course.name}</span> — par {sumPars(suggestion.draft.pars)}.{' '}
              {suggestion.note}
            </p>
            <button type="button" onClick={() => setDismissed(true)} className="text-emerald-400 hover:text-emerald-700 shrink-0" title="Not now">
              <X size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={acceptSuggestion}
            disabled={saving}
            className="w-full bg-emerald-600 text-white p-2 rounded-lg font-black text-[10px] uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : suggestion.complete ? 'Use this par' : 'Review and use this par'}
          </button>
        </div>
      )}

      {!open && error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      {open && (
        <div className="space-y-3">
          <ClubPicker detection={detection} holes={lobby.holes} selectedId={draft.club?.id ?? null} onPick={pick} />
          {note && <p className="text-xs font-bold text-emerald-700">{note}</p>}
          <ParEditor holes={lobby.holes} value={draft.pars} onChange={(pars) => setDraft({ ...draft, pars })} />
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <div className="flex gap-2">
            {own && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={saving}
                className="flex-1 bg-slate-100 text-slate-600 p-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Use event par ({sumPars(eventPars)})
              </button>
            )}
            <button
              type="button"
              onClick={() => save(draft.pars)}
              disabled={saving || !dirty}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 text-white p-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save my par ({sumPars(draft.pars)})
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            Only changes your own card. Your club and par show next to your name on the leaderboard.
          </p>
        </div>
      )}
    </div>
  );
}
