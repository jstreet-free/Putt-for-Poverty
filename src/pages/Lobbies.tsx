import { useEffect, useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Users, Lock, Globe, Calendar, Plus, Copy, Share2, LogOut, UserMinus,
  Trash2, X, Loader2, CheckCircle, ShieldCheck, KeyRound, Crown, Flag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { Lobby, LobbyMember } from '../types';
import {
  createLobby, deleteLobby, getMemberCount, getShareCode, joinLobby,
  kickMember, leaveLobby, updateLobby,
} from '../lib/lobbyService';

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

function formatDateTime(value: any): string {
  const d = toDate(value);
  if (!d) return 'Unknown date';
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ACCENTS = [
  { border: 'border-l-emerald-500', avatar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600' },
  { border: 'border-l-blue-500', avatar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600' },
  { border: 'border-l-violet-500', avatar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-600' },
  { border: 'border-l-amber-500', avatar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600' },
  { border: 'border-l-rose-500', avatar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600' },
  { border: 'border-l-cyan-500', avatar: 'bg-cyan-500', chip: 'bg-cyan-50 text-cyan-600' },
];

function pickAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

interface LobbiesProps {
  user: FirebaseUser | null;
  participant: any;
  isAdmin: boolean;
}

export function Lobbies({ user, participant, isAdmin }: LobbiesProps) {
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);

  const hasCredit = !!participant && (participant.paidRounds || 0) > (participant.usedRounds || 0);

  useEffect(() => {
    const q = query(collection(db, 'lobbies'), orderBy('eventDate', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setLobbies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lobby)));
      setLoading(false);
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'lobbies');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const entries = await Promise.all(lobbies.map(async (l) => {
        try {
          const count = await getMemberCount(l.id);
          return [l.id, count] as const;
        } catch {
          return [l.id, 0] as const;
        }
      }));
      if (active) setMemberCounts(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [lobbies]);

  const selectedLobby = lobbies.find(l => l.id === selectedLobbyId) || null;

  const handleCreateLobby = async (data: { name: string; isClosed: boolean; eventDate: Date }) => {
    if (!user || !participant) return;
    const { id } = await createLobby({
      name: data.name,
      isClosed: data.isClosed,
      eventDate: data.eventDate,
      creatorId: user.uid,
      creatorName: participant.name,
      creatorGolfClub: participant.golfClub,
    });
    setShowCreateModal(false);
    setSelectedLobbyId(id);
  };

  return (
    <div className="max-w-[90rem] mx-auto px-4 py-12 space-y-8">
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-blue-700 rounded-[2.5rem] p-8 md:p-12 shadow-xl">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -mr-24 -mt-24" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-amber-400/20 rounded-full blur-3xl -ml-16 -mb-16" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black text-white tracking-tight">GAME <span className="text-amber-300">LOBBIES</span></h1>
            <p className="text-emerald-50 font-medium mt-1">Schedule a round with friends, or join one that's already forming.</p>
          </div>
          {user ? (
            <button
              onClick={() => hasCredit ? setShowCreateModal(true) : navigate('/register')}
              className="flex items-center justify-center gap-2 bg-white text-emerald-700 px-6 py-3.5 rounded-2xl font-black text-sm hover:bg-amber-300 hover:text-emerald-900 transition-all shadow-lg shrink-0"
            >
              <Plus size={18} />
              {hasCredit ? 'CREATE LOBBY' : 'BUY A ROUND TO CREATE'}
            </button>
          ) : (
            <button
              onClick={() => navigate('/login', { state: { from: '/lobbies' } })}
              className="bg-white text-emerald-700 px-6 py-3.5 rounded-2xl font-black text-sm hover:bg-amber-300 hover:text-emerald-900 transition-all shadow-lg shrink-0"
            >
              SIGN IN TO PLAY
            </button>
          )}
        </div>
      </div>

      {user && !hasCredit && (
        <div className="bg-amber-50 border-2 border-amber-100 text-amber-700 px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2">
          You need an available round (credit) to create or join a lobby. A credit is spent automatically once a lobby you're in reaches its scheduled date.
        </div>
      )}

      {loading ? (
        <div className="p-24 text-center text-slate-400 font-bold flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin" />
          Loading lobbies...
        </div>
      ) : lobbies.length === 0 ? (
        <div className="p-24 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 space-y-3">
          <Users size={40} className="mx-auto text-emerald-300" />
          <p className="text-xl font-black text-slate-700">No lobbies yet</p>
          <p className="text-slate-400 font-medium">Be the first to schedule a round.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {lobbies.map((lobby) => (
            <LobbyCard
              key={lobby.id}
              lobby={lobby}
              memberCount={memberCounts[lobby.id] ?? 0}
              isMine={lobby.creatorId === user?.uid}
              onOpen={() => setSelectedLobbyId(lobby.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreateModal && user && participant && (
          <CreateLobbyModal
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreateLobby}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLobby && user && (
          <LobbyDetailModal
            lobby={selectedLobby}
            user={user}
            participant={participant}
            isAdmin={isAdmin}
            onClose={() => setSelectedLobbyId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LobbyCard({ lobby, memberCount, isMine, onOpen }: {
  lobby: Lobby; memberCount: number; isMine: boolean; onOpen: () => void;
}) {
  const accent = pickAccent(lobby.id);
  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-left bg-white p-6 rounded-[2rem] border-2 border-l-4 border-slate-100 ${accent.border} shadow-md hover:shadow-xl hover:-translate-y-1 transition-all space-y-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${accent.avatar} text-white font-black flex items-center justify-center shrink-0 shadow-sm`}>
            {lobby.name?.[0]?.toUpperCase() || '?'}
          </div>
          <h3 className="font-black text-slate-900 text-lg leading-tight truncate">{lobby.name}</h3>
        </div>
        <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
          lobby.isClosed ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {lobby.isClosed ? <Lock size={11} /> : <Globe size={11} />}
          {lobby.isClosed ? 'Private' : 'Open'}
        </span>
      </div>

      <div className="space-y-2 text-sm text-slate-500 font-medium">
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${accent.chip}`}>
            <Calendar size={12} />
          </span>
          {formatDateTime(lobby.eventDate)}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${accent.chip}`}>
            <Users size={12} />
          </span>
          {memberCount} joined
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-50">
        <span className="text-xs font-bold text-slate-400">Host: {lobby.creatorName}{isMine ? ' (you)' : ''}</span>
        {lobby.status === 'charged' && (
          <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-lg uppercase">Started</span>
        )}
      </div>
    </motion.button>
  );
}

function CreateLobbyModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (data: { name: string; isClosed: boolean; eventDate: Date }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  const [eventDate, setEventDate] = useState(toDatetimeLocalValue(minDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = new Date(eventDate);
    if (isNaN(parsed.getTime()) || parsed <= new Date()) {
      setError('Choose a date and time in the future.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), isClosed, eventDate: parsed });
    } catch (err) {
      console.error(err);
      setError('Could not create the lobby. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-black text-slate-900 tracking-tighter">CREATE LOBBY</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Lobby Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Saturday Morning Group"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Event Date & Time</label>
            <input
              required
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
            />
            <p className="text-[10px] text-slate-400 font-medium pl-1">Credits are taken from every member automatically once this date/time arrives.</p>
          </div>

          <label className="flex items-center gap-3 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={isClosed}
              onChange={(e) => setIsClosed(e.target.checked)}
              className="w-5 h-5 accent-emerald-600"
            />
            <div>
              <div className="font-black text-slate-800 text-sm">Private Lobby</div>
              <div className="text-xs text-slate-400 font-medium">Only joinable with a share code you send to friends. Still visible to everyone in the lobby list.</div>
            </div>
          </label>

          {error && (
            <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            {saving ? 'CREATING...' : 'CREATE LOBBY'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function LobbyDetailModal({ lobby, user, participant, isAdmin, onClose }: {
  lobby: Lobby;
  user: FirebaseUser;
  participant: any;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [membersError, setMembersError] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(lobby.name);
  const [editDate, setEditDate] = useState(() => {
    const d = toDate(lobby.eventDate);
    return d ? toDatetimeLocalValue(d) : '';
  });

  const isCreator = lobby.creatorId === user.uid;
  const isMember = members.some(m => m.id === user.uid);
  const hasCredit = !!participant && (participant.paidRounds || 0) > (participant.usedRounds || 0);
  const eventStarted = lobby.status === 'charged' || (toDate(lobby.eventDate)?.getTime() ?? 0) <= Date.now();

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'lobbies', lobby.id, 'members'),
      (snap) => {
        setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyMember)));
        setMembersError(false);
        setMembersLoading(false);
      },
      () => {
        setMembersError(true);
        setMembersLoading(false);
      }
    );
    return () => unsub();
  }, [lobby.id]);

  useEffect(() => {
    if (!isCreator && !isAdmin) return;
    if (!lobby.isClosed) return;
    getShareCode(lobby.id).then(setShareCode).catch(() => setShareCode(null));
  }, [lobby.id, lobby.isClosed, isCreator, isAdmin]);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/lobbies` : '';
  const shareText = shareCode
    ? `Join my "${lobby.name}" lobby on Putt for Poverty! Code: ${shareCode} — ${shareUrl}`
    : '';

  const handleCopyCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // clipboard API unavailable — user can still select the code manually
    }
  };

  const handleShare = async () => {
    if (!shareCode) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: lobby.name, text: shareText });
        return;
      } catch {
        // user cancelled or share failed — fall through to WhatsApp link
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
  };

  const handleJoin = async () => {
    if (!participant) return;
    setJoinError(null);
    setBusy(true);
    try {
      await joinLobby({
        lobbyId: lobby.id,
        isClosed: lobby.isClosed,
        userId: user.uid,
        name: participant.name,
        golfClub: participant.golfClub,
        enteredCode: enteredCode.trim().toUpperCase(),
      });
      setEnteredCode('');
    } catch (err) {
      console.error(err);
      setJoinError(lobby.isClosed ? 'Invalid code, or you may not have an available credit.' : 'Could not join this lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Leave this lobby?')) return;
    setBusy(true);
    try {
      await leaveLobby(lobby.id, user.uid);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lobbies/${lobby.id}/members/${user.uid}`);
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this lobby?`)) return;
    setBusy(true);
    try {
      await kickMember(lobby.id, memberId);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lobbies/${lobby.id}/members/${memberId}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLobby = async () => {
    if (!confirm(`Permanently delete "${lobby.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteLobby(lobby.id);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lobbies/${lobby.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    const parsed = new Date(editDate);
    if (isNaN(parsed.getTime()) || parsed <= new Date()) return;
    setBusy(true);
    try {
      await updateLobby(lobby.id, { name: editName.trim(), eventDate: parsed });
      setEditMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lobbies/${lobby.id}`);
    } finally {
      setBusy(false);
    }
  };

  const canManage = isCreator || isAdmin;
  const canSeeRoster = !membersError;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {editMode ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-2 font-black text-slate-900 text-xl mb-1"
              />
            ) : (
              <h3 className="text-2xl font-black text-slate-900 tracking-tight truncate flex items-center gap-2">
                {isAdmin && !isCreator && <ShieldCheck size={20} className="text-blue-500 shrink-0" />}
                {lobby.name}
              </h3>
            )}
            <p className="text-sm text-slate-400 font-medium flex items-center gap-1">
              <Calendar size={12} />
              {formatDateTime(lobby.eventDate)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors shrink-0">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
            lobby.isClosed ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {lobby.isClosed ? <Lock size={11} /> : <Globe size={11} />}
            {lobby.isClosed ? 'Private' : 'Open'}
          </span>
          {lobby.status === 'charged' && (
            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-lg uppercase">Credits Charged</span>
          )}
        </div>

        {editMode && canManage && (
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 space-y-3">
            <input
              type="datetime-local"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-white border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditMode(false)} className="flex-1 bg-white border-2 border-slate-200 p-2.5 rounded-xl font-black text-xs uppercase text-slate-600">Cancel</button>
              <button onClick={handleSaveEdit} disabled={busy} className="flex-1 bg-blue-600 text-white p-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-50">Save</button>
            </div>
          </div>
        )}

        {/* Creator/admin share panel */}
        {lobby.isClosed && canManage && !eventStarted && (
          <div className="bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-black text-xs uppercase tracking-widest">
              <KeyRound size={14} />
              Share Code
            </div>
            {shareCode ? (
              <>
                <div className="text-3xl font-black text-emerald-900 tracking-[0.3em] text-center bg-white rounded-xl p-3 border-2 border-emerald-100">
                  {shareCode}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-emerald-200 text-emerald-700 p-2.5 rounded-xl font-black text-xs uppercase hover:bg-emerald-100 transition-colors"
                  >
                    {codeCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white p-2.5 rounded-xl font-black text-xs uppercase hover:bg-emerald-700 transition-colors"
                  >
                    <Share2 size={14} />
                    Share
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-emerald-700 font-bold">Loading code...</div>
            )}
          </div>
        )}

        {/* Roster / join */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-700 font-black text-xs uppercase tracking-widest">
            <Users size={14} />
            Members {canSeeRoster ? `(${members.length})` : ''}
          </div>

          {membersLoading ? (
            <div className="text-center py-6 text-slate-400"><Loader2 className="animate-spin mx-auto" size={20} /></div>
          ) : !canSeeRoster ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 space-y-3 text-center">
              <Lock size={24} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-500">This is a private lobby. Enter the share code to view members and join.</p>
              <input
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value)}
                placeholder="ENTER CODE"
                className="w-full text-center tracking-[0.2em] bg-white border-2 border-slate-200 rounded-xl p-3 font-black uppercase text-slate-900 focus:border-emerald-500 outline-none"
              />
              {joinError && <p className="text-xs font-bold text-rose-600">{joinError}</p>}
              <button
                onClick={handleJoin}
                disabled={busy || !hasCredit || !enteredCode.trim() || eventStarted}
                className="w-full bg-emerald-600 text-white p-3 rounded-xl font-black text-sm uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {busy ? 'Joining...' : 'Join with Code'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-400 font-black uppercase shrink-0 border border-slate-100">
                      {m.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-1">
                        {m.name}
                        {m.id === lobby.creatorId && <Crown size={12} className="text-amber-500 shrink-0" />}
                      </div>
                      {m.golfClub && (
                        <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                          <Flag size={10} />
                          {m.golfClub}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.chargeStatus === 'charged' && (
                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">Charged</span>
                    )}
                    {m.chargeStatus === 'insufficient_credit' && (
                      <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded uppercase">No Credit</span>
                    )}
                    {canManage && m.id !== lobby.creatorId && (
                      <button
                        onClick={() => handleKick(m.id, m.name)}
                        disabled={busy}
                        className="text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                        title="Remove from lobby"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!isMember && !isCreator && !eventStarted && (
                <button
                  onClick={handleJoin}
                  disabled={busy || !hasCredit}
                  className="w-full bg-emerald-600 text-white p-3.5 rounded-xl font-black text-sm uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50 mt-2"
                >
                  {!hasCredit ? 'Need a Credit to Join' : busy ? 'Joining...' : 'Join Lobby'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
          {isMember && !isCreator && (
            <button
              onClick={handleLeave}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-600 p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <LogOut size={14} />
              Leave Lobby
            </button>
          )}
          {canManage && !editMode && !eventStarted && (
            <button
              onClick={() => setEditMode(true)}
              className="flex-1 bg-slate-100 text-slate-600 p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
            >
              Edit Details
            </button>
          )}
          {canManage && (
            <button
              onClick={handleDeleteLobby}
              disabled={busy || (!isAdmin && eventStarted)}
              className="flex-1 flex items-center justify-center gap-2 bg-rose-100 text-rose-700 p-3 rounded-xl font-black text-xs uppercase hover:bg-rose-200 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete Lobby
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
