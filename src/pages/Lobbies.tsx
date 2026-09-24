import { useEffect, useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  Users, Lock, Globe, Calendar, Plus, Copy, Share2, LogOut, UserMinus,
  Trash2, X, Loader2, CheckCircle, ShieldCheck, KeyRound, Crown, Flag, ArrowRight,
  Radio, MapPin, PlayCircle, Trophy, Clock, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { Lobby, LobbyMember, LobbyResult } from '../types';
import {
  createLobby, deleteLobby, finishLobby, getMemberCount, getMemberPreview,
  getMyActiveLobby, getShareCode, joinLobby, kickMember, leaveLobby,
  lobbyStartMs, startLobby, subscribeToLobby, updateLobby,
} from '../lib/lobbyService';
import { LiveLobbyView } from '../components/lobby/LiveLobbyView';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

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

function formatTime(value: any): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ACCENTS = [
  { avatar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-500', gradient: 'from-emerald-400 to-teal-500' },
  { avatar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', text: 'text-blue-500', gradient: 'from-blue-400 to-indigo-500' },
  { avatar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-600', text: 'text-violet-500', gradient: 'from-violet-400 to-purple-500' },
  { avatar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', text: 'text-amber-500', gradient: 'from-amber-400 to-orange-500' },
  { avatar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600', text: 'text-rose-500', gradient: 'from-rose-400 to-pink-500' },
  { avatar: 'bg-cyan-500', chip: 'bg-cyan-50 text-cyan-600', text: 'text-cyan-500', gradient: 'from-cyan-400 to-blue-500' },
];

function pickAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function MemberAvatar({ member, size = 40, ring = 'border-white' }: {
  member: Pick<LobbyMember, 'id' | 'name' | 'avatarUrl'>;
  size?: number;
  ring?: string;
}) {
  const accent = pickAccent(member.id);
  return (
    <div
      className={`rounded-full overflow-hidden border-2 ${ring} shadow-sm shrink-0 flex items-center justify-center ${member.avatarUrl ? 'bg-slate-100' : accent.avatar}`}
      style={{ width: size, height: size }}
    >
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-black uppercase" style={{ fontSize: size * 0.4 }}>
          {member.name?.[0] || '?'}
        </span>
      )}
    </div>
  );
}

interface LobbiesProps {
  user: FirebaseUser | null;
  participant: any;
  isAdmin: boolean;
}

export function Lobbies({ user, participant, isAdmin }: LobbiesProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [memberPreviews, setMemberPreviews] = useState<Record<string, LobbyMember[]>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(() => searchParams.get('lobby'));
  const [myActiveLobby, setMyActiveLobby] = useState<Lobby | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const hasCredit = !!participant && (participant.paidRounds || 0) > (participant.usedRounds || 0);

  useEffect(() => {
    const q = query(collection(db, 'lobbies'), where('status', 'in', ['scheduled', 'live']), orderBy('eventDate', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setLobbies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lobby)));
      setLoading(false);
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'lobbies');
    });
    return () => unsub();
  }, []);

  const refreshActiveLobby = () => {
    if (!user) { setMyActiveLobby(null); return; }
    getMyActiveLobby(user.uid).then(setMyActiveLobby).catch((err) => console.warn('Could not check active lobby:', err));
  };

  useEffect(() => {
    refreshActiveLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lobbies]);

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.all(lobbies.map(async (l) => {
        // A signed-out visitor can never read a private roster, so don't even
        // ask — it would just be a guaranteed permission error per lobby.
        if (l.isClosed && !user) return [l.id, 0, [] as LobbyMember[]] as const;
        try {
          const [count, preview] = await Promise.all([
            getMemberCount(l.id),
            getMemberPreview(l.id, 4),
          ]);
          return [l.id, count, preview] as const;
        } catch {
          // Closed lobbies reject roster reads from non-members — the card
          // just shows no avatars in that case.
          return [l.id, 0, [] as LobbyMember[]] as const;
        }
      }));
      if (!active) return;
      setMemberCounts(Object.fromEntries(results.map(([id, count]) => [id, count])));
      setMemberPreviews(Object.fromEntries(results.map(([id, , preview]) => [id, preview])));
    })();
    return () => { active = false; };
  }, [lobbies, user]);

  const selectedLobby = lobbies.find(l => l.id === selectedLobbyId) || null;

  const handleCreateLobby = async (data: { name: string; isClosed: boolean; eventDate: Date; holes: 9 | 18 }) => {
    if (!user || !participant) return;
    setCreateError(null);
    try {
      const { id } = await createLobby(data);
      setShowCreateModal(false);
      setSelectedLobbyId(id);
      refreshActiveLobby();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the lobby.');
      throw err;
    }
  };

  const closeModal = () => {
    setSelectedLobbyId(null);
    if (searchParams.has('lobby')) {
      searchParams.delete('lobby');
      setSearchParams(searchParams, { replace: true });
    }
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
            myActiveLobby ? (
              <button
                onClick={() => setSelectedLobbyId(myActiveLobby.id)}
                className="flex items-center justify-center gap-2 bg-white text-emerald-700 px-6 py-3.5 rounded-2xl font-black text-sm hover:bg-amber-300 hover:text-emerald-900 transition-all shadow-lg shrink-0"
              >
                <ArrowRight size={18} />
                GO TO YOUR LOBBY
              </button>
            ) : (
              <button
                onClick={() => hasCredit ? setShowCreateModal(true) : navigate('/register')}
                className="flex items-center justify-center gap-2 bg-white text-emerald-700 px-6 py-3.5 rounded-2xl font-black text-sm hover:bg-amber-300 hover:text-emerald-900 transition-all shadow-lg shrink-0"
              >
                <Plus size={18} />
                {hasCredit ? 'CREATE LOBBY' : 'BUY A ROUND TO CREATE'}
              </button>
            )
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

      {user && myActiveLobby && (
        <div className="bg-blue-50 border-2 border-blue-100 text-blue-700 px-5 py-4 rounded-2xl font-bold text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Users size={16} className="shrink-0" />
            You're already in "{myActiveLobby.name}" — you can only be in one active lobby at a time.
          </span>
          <button onClick={() => setSelectedLobbyId(myActiveLobby.id)} className="shrink-0 underline">View</button>
        </div>
      )}

      {user && !myActiveLobby && !hasCredit && (
        <div className="bg-amber-50 border-2 border-amber-100 text-amber-700 px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2">
          You need an available round (credit) to create or join a lobby. A credit is charged the moment the host starts the event.
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
              memberPreview={memberPreviews[lobby.id] ?? []}
              isMine={lobby.creatorId === user?.uid}
              onOpen={() => setSelectedLobbyId(lobby.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreateModal && user && participant && (
          <CreateLobbyModal
            error={createError}
            onClose={() => { setShowCreateModal(false); setCreateError(null); }}
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
            hasOtherActiveLobby={!!myActiveLobby && myActiveLobby.id !== selectedLobby.id}
            onMembersChange={(lobbyId, updated) => {
              setMemberCounts(prev => ({ ...prev, [lobbyId]: updated.length }));
              setMemberPreviews(prev => ({ ...prev, [lobbyId]: updated.slice(0, 4) }));
            }}
            onActiveLobbyChange={refreshActiveLobby}
            onClose={closeModal}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LobbyCard({ lobby, memberCount, memberPreview, isMine, onOpen }: {
  lobby: Lobby; memberCount: number; memberPreview: LobbyMember[]; isMine: boolean; onOpen: () => void;
}) {
  const accent = pickAccent(lobby.id);
  const d = toDate(lobby.eventDate);
  const live = lobby.status === 'live';
  const overflow = memberCount - memberPreview.length;

  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.99 }}
      className="text-left bg-white rounded-[2rem] border-2 border-slate-100 shadow-md hover:shadow-2xl transition-shadow overflow-hidden flex flex-col"
    >
      <div className={`h-2.5 w-full bg-gradient-to-r ${accent.gradient}`} />

      <div className="p-7 space-y-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            {/* Ticket-style date block */}
            <div className={`w-14 h-14 rounded-2xl ${accent.avatar} text-white shrink-0 shadow-md flex flex-col items-center justify-center leading-none`}>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-80">
                {d ? d.toLocaleDateString(undefined, { month: 'short' }) : '--'}
              </span>
              <span className="text-xl font-black">{d ? d.getDate() : '?'}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-xl leading-tight truncate">{lobby.name}</h3>
              <p className="text-xs text-slate-400 font-bold">{d ? formatTime(d) : ''} · {lobby.holes || 18} holes</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-xl uppercase ${
              lobby.isClosed ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {lobby.isClosed ? <Lock size={12} /> : <Globe size={12} />}
              {lobby.isClosed ? 'Private' : 'Open'}
            </span>
            {live && (
              <span className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl uppercase bg-rose-500 text-white">
                <Radio size={11} className="animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>

        <div className="text-sm text-slate-500 font-bold flex items-center gap-2">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          {formatDateTime(lobby.eventDate)}
        </div>

        <div className="flex-1" />

        {/* Who's in — the roster at a glance */}
        <div className="flex items-center gap-2">
          {memberPreview.length > 0 ? (
            <>
              <div className="flex -space-x-2">
                {memberPreview.map(m => (
                  <MemberAvatar key={m.id} member={m} size={32} />
                ))}
                {overflow > 0 && (
                  <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 text-slate-600 text-[10px] font-black flex items-center justify-center shrink-0">
                    +{overflow}
                  </div>
                )}
              </div>
              <span className="text-xs font-bold text-slate-400">{memberCount} in lobby</span>
            </>
          ) : (
            <span className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl ${accent.chip}`}>
              <Users size={13} />
              {lobby.isClosed ? 'Private roster' : `${memberCount} in lobby`}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t-2 border-slate-50">
          <span className="text-xs font-bold text-slate-400 truncate max-w-[150px]">
            Host: {lobby.creatorName}{isMine ? ' (you)' : ''}
          </span>
          <ArrowRight size={18} className={`${accent.text}`} />
        </div>
      </div>
    </motion.button>
  );
}

function CreateLobbyModal({ onClose, onSubmit, error }: {
  onClose: () => void;
  onSubmit: (data: { name: string; isClosed: boolean; eventDate: Date; holes: 9 | 18 }) => Promise<void>;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [holes, setHoles] = useState<9 | 18>(18);
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  const [eventDate, setEventDate] = useState(toDatetimeLocalValue(minDate));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const parsed = new Date(eventDate);
    if (isNaN(parsed.getTime()) || parsed <= new Date()) {
      setLocalError('Choose a date and time in the future.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), isClosed, eventDate: parsed, holes });
    } catch {
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
            <p className="text-[10px] text-slate-400 font-medium pl-1">Credits are taken from every member the moment you press Start on the day.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Holes</label>
            <div className="grid grid-cols-2 gap-3">
              {([9, 18] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHoles(h)}
                  className={`p-3.5 rounded-2xl font-black text-sm border-2 transition-colors ${
                    holes === h ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-600'
                  }`}
                >
                  {h} Holes
                </button>
              ))}
            </div>
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

          {(localError || error) && (
            <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">{localError || error}</div>
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

function LobbyDetailModal({ lobby: initialLobby, user, participant, isAdmin, hasOtherActiveLobby, onMembersChange, onActiveLobbyChange, onClose }: {
  lobby: Lobby;
  user: FirebaseUser;
  participant: any;
  isAdmin: boolean;
  hasOtherActiveLobby: boolean;
  onMembersChange: (lobbyId: string, members: LobbyMember[]) => void;
  onActiveLobbyChange: () => void;
  onClose: () => void;
}) {
  const [lobby, setLobby] = useState<Lobby>(initialLobby);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [membersError, setMembersError] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(initialLobby.name);
  const [editIsClosed, setEditIsClosed] = useState(initialLobby.isClosed);
  const [editDate, setEditDate] = useState(() => {
    const d = toDate(initialLobby.eventDate);
    return d ? toDatetimeLocalValue(d) : '';
  });
  const [result, setResult] = useState<LobbyResult | null>(null);
  const [autoFinishTried, setAutoFinishTried] = useState(false);

  const isCreator = lobby.creatorId === user.uid;
  const isMember = members.some(m => m.id === user.uid);
  const myMember = members.find(m => m.id === user.uid);
  const hasCredit = !!participant && (participant.paidRounds || 0) > (participant.usedRounds || 0);
  const canManage = isCreator || isAdmin;
  const canSeeRoster = !membersError;

  const eventMs = lobbyStartMs(lobby);
  const expiresMs = toDate(lobby.expiresAt)?.getTime() ?? 0;
  const now = Date.now();
  const canStartWindowOpensAt = eventMs - FIFTEEN_MIN_MS;
  const isPastExpiry = expiresMs > 0 && now >= expiresMs;

  // Keeps this modal in sync the instant the host presses Start or Finish,
  // for everyone who happens to have it open.
  useEffect(() => {
    const unsub = subscribeToLobby(lobby.id, (updated) => {
      if (updated) setLobby(updated);
    }, () => {});
    return () => unsub();
  }, [lobby.id]);

  // Client-side fallback for the once-a-day maintenance cron: if a live
  // event's window has already run out by the time anyone looks at it,
  // trigger the finish ourselves (the server allows any member to do this
  // once expiresAt has passed, not just the host).
  useEffect(() => {
    if (autoFinishTried) return;
    if (lobby.status === 'live' && isPastExpiry) {
      setAutoFinishTried(true);
      finishLobby(lobby.id).catch((err) => console.warn('Auto-finish failed:', err));
    }
  }, [lobby.status, isPastExpiry, lobby.id, autoFinishTried]);

  useEffect(() => {
    if (lobby.status !== 'finished') { setResult(null); return; }
    let active = true;
    getDoc(doc(db, 'lobbies', lobby.id, 'results', 'final'))
      .then((snap) => { if (active && snap.exists()) setResult(snap.data() as LobbyResult); })
      .catch((err) => console.warn('Could not load final results:', err));
    return () => { active = false; };
  }, [lobby.status, lobby.id]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'lobbies', lobby.id, 'members'),
      (snap) => {
        const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyMember));
        setMembers(next);
        setMembersError(false);
        setMembersLoading(false);
        onMembersChange(lobby.id, next);
      },
      () => {
        setMembersError(true);
        setMembersLoading(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id]);

  useEffect(() => {
    if (!canManage) return;
    if (!lobby.isClosed) return;
    if (lobby.status !== 'scheduled') return;
    getShareCode(lobby.id).then(setShareCode).catch(() => setShareCode(null));
  }, [lobby.id, lobby.isClosed, lobby.status, canManage]);

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
      await joinLobby({ lobbyId: lobby.id, enteredCode: enteredCode.trim().toUpperCase() });
      setEnteredCode('');
      onActiveLobbyChange();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join this lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Leave this lobby?')) return;
    setBusy(true);
    try {
      await leaveLobby(lobby.id, user.uid);
      onActiveLobbyChange();
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
      onActiveLobbyChange();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete this lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    const parsed = new Date(editDate);
    if (isNaN(parsed.getTime()) || parsed <= new Date()) return;
    setBusy(true);
    try {
      const saveResult = await updateLobby(
        lobby.id,
        { name: editName.trim(), isClosed: editIsClosed, eventDate: parsed },
        lobby.creatorId
      );
      if (saveResult.shareCode) setShareCode(saveResult.shareCode);
      setEditMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lobbies/${lobby.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (!confirm('Start this event now? A credit will be charged immediately from every member who has one available.')) return;
    setBusy(true);
    try {
      await startLobby(lobby.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not start this event.');
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    if (!confirm('Finish this event now? This locks in the final leaderboard for everyone.')) return;
    setBusy(true);
    try {
      await finishLobby(lobby.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not finish this event.');
    } finally {
      setBusy(false);
    }
  };

  const startAvailable = now >= canStartWindowOpensAt;
  const isSpectator = lobby.status === 'live' && myMember?.chargeStatus !== 'charged';

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
              {formatDateTime(lobby.eventDate)} · {lobby.holes || 18} holes
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
          {lobby.status === 'live' && (
            <span className="flex items-center gap-1 text-[10px] font-black bg-rose-500 text-white px-2 py-1 rounded-lg uppercase">
              <Radio size={11} className="animate-pulse" />
              Event Live
            </span>
          )}
          {lobby.status === 'finished' && (
            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-lg uppercase">Finished</span>
          )}
          {lobby.status === 'expired' && (
            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase">Expired</span>
          )}
          {isSpectator && (
            <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-2 py-1 rounded-lg uppercase">Spectating</span>
          )}
        </div>

        {/* --- Finished: show the archived result --- */}
        {lobby.status === 'finished' && (
          <div className="space-y-4">
            {result ? (
              <div className="space-y-2">
                {result.standings.map((row) => (
                  <div key={row.userId} className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
                        row.position === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {row.position === 1 ? <Trophy size={13} /> : row.position}
                      </div>
                      <div className="font-black text-slate-800 text-sm truncate">
                        {row.userId === user.uid ? 'You' : row.name}
                      </div>
                    </div>
                    <div className="text-lg font-black text-slate-900 shrink-0">{row.total}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400"><Loader2 className="animate-spin mx-auto" size={20} /></div>
            )}
            <Link
              to="/my-rounds"
              className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-600 p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
            >
              View My Rounds
            </Link>
          </div>
        )}

        {/* --- Expired: nobody ever started it --- */}
        {lobby.status === 'expired' && (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2">
            <AlertTriangle size={24} className="mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-500">This lobby expired before the host started it. No credits were charged.</p>
          </div>
        )}

        {/* --- Live: the event view --- */}
        {lobby.status === 'live' && myMember && (
          <LiveLobbyView
            lobby={lobby}
            members={members}
            currentUser={{ uid: user.uid, name: participant?.name || 'You', avatarUrl: participant?.avatarUrl || user.photoURL || undefined }}
            isSpectator={isSpectator}
            canManage={canManage}
            onFinish={handleFinish}
            busy={busy}
          />
        )}
        {lobby.status === 'live' && !myMember && (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2">
            <Radio size={24} className="mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-500">This event is already live — you can no longer join.</p>
          </div>
        )}

        {/* --- Scheduled: the normal management view --- */}
        {lobby.status === 'scheduled' && (
          <>
            {editMode && canManage && (
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 space-y-3">
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-white border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900"
                />
                <label className="flex items-center gap-3 bg-white border-2 border-slate-100 rounded-xl p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!editIsClosed}
                    onChange={(e) => setEditIsClosed(!e.target.checked)}
                    className="w-5 h-5 accent-emerald-600"
                  />
                  <div>
                    <div className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                      {editIsClosed ? <Lock size={13} className="text-violet-500" /> : <Globe size={13} className="text-emerald-500" />}
                      {editIsClosed ? 'Private — code required to join' : 'Open — anyone can join'}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">Tick to make this lobby open to everyone.</div>
                  </div>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setEditMode(false)} className="flex-1 bg-white border-2 border-slate-200 p-2.5 rounded-xl font-black text-xs uppercase text-slate-600">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={busy} className="flex-1 bg-blue-600 text-white p-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-50">Save</button>
                </div>
              </div>
            )}

            {/* Creator/admin share panel */}
            {lobby.isClosed && canManage && (
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
                    disabled={busy || !hasCredit || !enteredCode.trim() || hasOtherActiveLobby}
                    className="w-full bg-emerald-600 text-white p-3 rounded-xl font-black text-sm uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {hasOtherActiveLobby ? "Already in another lobby" : busy ? 'Joining...' : 'Join with Code'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border-2 transition-colors ${
                        m.id === user.uid ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberAvatar member={m} size={40} />
                        <div className="min-w-0">
                          <div className="font-black text-slate-800 text-sm truncate flex items-center gap-1.5">
                            {m.id === user.uid ? 'You' : m.name}
                            {m.id === lobby.creatorId && <Crown size={12} className="text-amber-500 shrink-0" />}
                          </div>
                          {m.golfClub && (
                            <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1 truncate">
                              <Flag size={10} className="shrink-0" />
                              {m.golfClub}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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

                  {!isMember && !isCreator && (
                    <button
                      onClick={handleJoin}
                      disabled={busy || !hasCredit || hasOtherActiveLobby}
                      className="w-full bg-emerald-600 text-white p-3.5 rounded-xl font-black text-sm uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50 mt-2"
                    >
                      {hasOtherActiveLobby ? "You're already in another lobby" : !hasCredit ? 'Need a Credit to Join' : busy ? 'Joining...' : 'Join Lobby'}
                    </button>
                  )}
                  {joinError && <p className="text-xs font-bold text-rose-600 text-center">{joinError}</p>}
                </div>
              )}
            </div>

            {/* Host: start the event */}
            {canManage && (
              <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest">
                  <PlayCircle size={14} className="text-emerald-400" />
                  Start Event
                </div>
                <p className="text-xs text-slate-300 font-medium">
                  {startAvailable
                    ? 'Everyone with an available credit will be charged the instant you press Start.'
                    : `Available from ${formatTime(new Date(canStartWindowOpensAt))} (15 min before the scheduled time).`}
                </p>
                <button
                  onClick={handleStart}
                  disabled={busy || !startAvailable}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white p-3.5 rounded-xl font-black text-sm uppercase hover:bg-emerald-400 transition-colors disabled:opacity-40"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                  {busy ? 'Starting...' : startAvailable ? 'Start Event Now' : 'Not Yet Available'}
                </button>
              </div>
            )}

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
              {canManage && !editMode && (
                <button
                  onClick={() => {
                    setEditName(lobby.name);
                    setEditIsClosed(lobby.isClosed);
                    const d = toDate(lobby.eventDate);
                    setEditDate(d ? toDatetimeLocalValue(d) : '');
                    setEditMode(true);
                  }}
                  className="flex-1 bg-slate-100 text-slate-600 p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
                >
                  Edit Details
                </button>
              )}
              {canManage && (
                <button
                  onClick={handleDeleteLobby}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-100 text-rose-700 p-3 rounded-xl font-black text-xs uppercase hover:bg-rose-200 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Delete Lobby
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
