import { useState } from 'react';
import { db } from '../lib/firebase';
import {
  collection, query, orderBy, limit, startAt, endAt,
  startAfter, getDocs, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import {
  Search, Users, X, Mail, MapPin, Trophy, FileCheck,
  FileX, ExternalLink, Loader2, ChevronDown, Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const PAGE_SIZE = 50;

interface AdminParticipant {
  id: string;
  name?: string;
  email?: string;
  emailLower?: string;
  golfClub?: string;
  course?: string;
  handicap?: number;
  role?: string;
  createdAt?: string;
  location?: { label?: string };
  membershipProofUrl?: string;
  membershipProofFileName?: string;
  paidRounds?: number;
  usedRounds?: number;
  [key: string]: any;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminParticipant | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runQuery = async (opts: { search?: string; cursor?: QueryDocumentSnapshot<DocumentData> | null }) => {
    const base = collection(db, 'participants');
    const term = opts.search?.trim().toLowerCase();

    let q;
    if (term) {
      q = query(
        base,
        orderBy('emailLower'),
        startAt(term),
        endAt(term + '\uf8ff'),
        limit(PAGE_SIZE)
      );
    } else if (opts.cursor) {
      q = query(base, orderBy('emailLower'), startAfter(opts.cursor), limit(PAGE_SIZE));
    } else {
      q = query(base, orderBy('emailLower'), limit(PAGE_SIZE));
    }

    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminParticipant));
    return { docs, lastVisible: snap.docs[snap.docs.length - 1] || null, count: snap.docs.length };
  };

  const loadFirstPage = async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const { docs, lastVisible, count } = await runQuery({ search });
      setUsers(docs);
      setLastDoc(lastVisible);
      setHasMore(count === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError('Failed to load users. You may need a Firestore index for this query \u2014 check the browser console for a create-index link.');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { docs, lastVisible, count } = await runQuery({ search: searchTerm, cursor: lastDoc });
      setUsers(prev => [...prev, ...docs]);
      setLastDoc(lastVisible);
      setHasMore(count === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError('Failed to load more users.');
    } finally {
      setLoadingMore(false);
    }
  };

  // Initial load
  useState(() => {
    loadFirstPage('');
  });

  let searchDebounce: ReturnType<typeof setTimeout>;
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadFirstPage(value), 350);
  };

  const formatDate = (iso?: string) => {
    if (!iso) return 'Unknown';
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">USER <span className="text-blue-600">DIRECTORY</span></h1>
          <p className="text-slate-500 font-medium">Search and review all registered participants.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
          <Users size={18} className="text-blue-500" />
          <span className="font-black text-slate-700">{users.length}{hasMore ? '+' : ''} loaded</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by email..."
          className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 pl-14 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors shadow-sm"
        />
      </div>

      {error && (
        <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">
          {error}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-24 text-center text-slate-400 font-bold flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-24 text-center text-slate-400 font-bold">
            No users found{searchTerm ? ` for "${searchTerm}"` : ''}.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className="w-full flex items-center justify-between gap-4 p-5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 font-black uppercase">
                    {u.name?.[0] || u.email?.[0] || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 truncate">{u.name || 'Unnamed'}</div>
                    <div className="text-sm text-slate-400 font-medium truncate flex items-center gap-1">
                      <Mail size={12} />
                      {u.email || 'No email on file'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {u.membershipProofUrl && (
                    <span className="text-emerald-600" title="Membership proof uploaded">
                      <FileCheck size={18} />
                    </span>
                  )}
                  {u.role === 'admin' && (
                    <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-1 rounded-lg uppercase">Admin</span>
                  )}
                  <span className="text-xs font-bold text-slate-400">{formatDate(u.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && hasMore && !searchTerm && (
          <div className="p-4 border-t border-slate-50">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-2 text-blue-600 font-black text-sm p-3 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
              {loadingMore ? 'LOADING...' : 'LOAD 50 MORE'}
            </button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xl uppercase">
                    {selectedUser.name?.[0] || selectedUser.email?.[0] || '?'}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedUser.name || 'Unnamed'}</h3>
                    <p className="text-sm text-slate-400 font-medium flex items-center gap-1">
                      <Mail size={12} />
                      {selectedUser.email || 'No email on file'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-slate-300 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Calendar size={12} /> Joined
                  </div>
                  <div className="font-bold text-slate-800">{formatDate(selectedUser.createdAt)}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Trophy size={12} /> Handicap
                  </div>
                  <div className="font-bold text-slate-800">{selectedUser.handicap ?? 'Not set'}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1 col-span-2">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Golf Club & Course</div>
                  <div className="font-bold text-slate-800">{selectedUser.golfClub || 'Not set'}{selectedUser.course ? ` \u2014 ${selectedUser.course}` : ''}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1 col-span-2">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <MapPin size={12} /> Location
                  </div>
                  <div className="font-bold text-slate-800">{selectedUser.location?.label || 'Not set'}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rounds Paid</div>
                  <div className="font-bold text-slate-800">{selectedUser.paidRounds ?? 0}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rounds Used</div>
                  <div className="font-bold text-slate-800">{selectedUser.usedRounds ?? 0}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <FileCheck size={12} />
                  Membership Proof
                </div>
                {selectedUser.membershipProofUrl ? (
                  <div className="space-y-3">
                    {/\.(jpe?g|png|gif|webp)$/i.test(selectedUser.membershipProofFileName || '') ? (
                      <img
                        src={selectedUser.membershipProofUrl}
                        alt="Membership proof"
                        className="w-full max-h-64 object-contain rounded-2xl border-2 border-slate-100 bg-slate-50"
                      />
                    ) : (
                      <div className="flex items-center gap-3 bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4">
                        <FileCheck size={20} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-800 truncate">{selectedUser.membershipProofFileName || 'Document'}</span>
                      </div>
                    )}
                    <a
                      href={selectedUser.membershipProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-black text-blue-600 hover:text-blue-800"
                    >
                      OPEN FULL FILE
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-orange-50 border-2 border-orange-100 text-orange-700 px-4 py-3 rounded-xl font-bold text-sm">
                    <FileX size={18} />
                    No membership proof uploaded
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}