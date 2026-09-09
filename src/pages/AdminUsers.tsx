import { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection, query, orderBy, limit,
  startAfter, getDocs, documentId,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import {
  Search, Users, X, Mail, MapPin, Trophy, FileCheck,
  FileX, ExternalLink, Loader2, ChevronDown, Calendar, UserPlus, CheckCircle,
  Pencil, Save, Ban, ShieldCheck, ShieldOff, Trash2,
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
  isParticipant?: boolean;
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
  const [makingParticipant, setMakingParticipant] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<AdminParticipant>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const runQuery = async (opts: { cursor?: QueryDocumentSnapshot<DocumentData> | null }) => {
    const base = collection(db, 'users');
    const q = opts.cursor
      ? query(base, orderBy(documentId()), startAfter(opts.cursor), limit(PAGE_SIZE))
      : query(base, orderBy(documentId()), limit(PAGE_SIZE));

    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminParticipant));
    return { docs, lastVisible: snap.docs[snap.docs.length - 1] || null, count: snap.docs.length };
  };

  const enrichWithParticipantStatus = async (docs: AdminParticipant[]): Promise<AdminParticipant[]> => {
    await Promise.all(docs.map(async (u) => {
      try {
        const snap = await getDoc(doc(db, 'participants', u.id));
        u.isParticipant = snap.exists();
      } catch {
        u.isParticipant = false;
      }
    }));
    return docs;
  };

  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const { docs, lastVisible, count } = await runQuery({});
      await enrichWithParticipantStatus(docs);
      setUsers(docs);
      setLastDoc(lastVisible);
      setHasMore(count === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError('Failed to load users. You may need Firestore rules that allow an admin to list all participants \u2014 check the browser console for details.');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { docs, lastVisible, count } = await runQuery({ cursor: lastDoc });
      await enrichWithParticipantStatus(docs);
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

  useState(() => {
    loadFirstPage();
  });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const handleMakeParticipant = async (u: AdminParticipant) => {
    setMakingParticipant(prev => ({ ...prev, [u.id]: 'loading' }));
    try {
      const partRef = doc(db, 'participants', u.id);
      await setDoc(partRef, {
        userId: u.id,
        name: u.name || '',
        email: u.email || '',
        emailLower: u.emailLower || u.email?.toLowerCase() || '',
        golfClub: u.golfClub || '',
        course: u.course || '',
        handicap: u.handicap ?? 0,
        location: u.location ? { label: u.location.label || '', lat: (u.location as any)?.lat ?? 0, lng: (u.location as any)?.lng ?? 0 } : { label: '' },
        role: 'user',
        paidRounds: 0,
        usedRounds: 0,
        membershipProofUrl: u.membershipProofUrl || '',
        membershipProofFileName: u.membershipProofFileName || '',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isParticipant: true } : x));
      if (selectedUser?.id === u.id) {
        setSelectedUser(prev => prev ? { ...prev, isParticipant: true } : prev);
      }
      setMakingParticipant(prev => ({ ...prev, [u.id]: 'success' }));
      setTimeout(() => setMakingParticipant(prev => ({ ...prev, [u.id]: 'idle' })), 2000);
    } catch (err) {
      console.error(err);
      setMakingParticipant(prev => ({ ...prev, [u.id]: 'error' }));
    }
  };

  const startEdit = (u: AdminParticipant) => {
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      golfClub: u.golfClub || '',
      course: u.course || '',
      handicap: u.handicap ?? 0,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    setSavingEdit(true);
    try {
      const updates = {
        name: editForm.name,
        email: editForm.email,
        emailLower: (editForm.email || '').toLowerCase(),
        golfClub: editForm.golfClub,
        course: editForm.course,
        handicap: Number(editForm.handicap) || 0,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'users', selectedUser.id), updates);
      if (selectedUser.isParticipant) {
        await updateDoc(doc(db, 'participants', selectedUser.id), updates);
      }
      const merged = { ...selectedUser, ...updates };
      setUsers((prev) => prev.map((x) => (x.id === selectedUser.id ? merged : x)));
      setSelectedUser(merged);
      setIsEditing(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${selectedUser.id}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleRole = async (u: AdminParticipant) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Make ${u.name || u.email} ${newRole === 'admin' ? 'an admin' : 'a regular user'}?`)) return;
    setRowBusy((prev) => ({ ...prev, [u.id]: true }));
    try {
      await setDoc(doc(db, 'users', u.id), { role: newRole }, { merge: true });
      const merged = { ...u, role: newRole };
      setUsers((prev) => prev.map((x) => (x.id === u.id ? merged : x)));
      if (selectedUser?.id === u.id) setSelectedUser(merged);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.id}`);
    } finally {
      setRowBusy((prev) => ({ ...prev, [u.id]: false }));
    }
  };

  const handleToggleSuspend = async (u: AdminParticipant) => {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    if (!confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${u.name || u.email}?`)) return;
    setRowBusy((prev) => ({ ...prev, [u.id]: true }));
    try {
      await setDoc(doc(db, 'users', u.id), { status: newStatus }, { merge: true });
      const merged = { ...u, status: newStatus };
      setUsers((prev) => prev.map((x) => (x.id === u.id ? merged : x)));
      if (selectedUser?.id === u.id) setSelectedUser(merged);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.id}`);
    } finally {
      setRowBusy((prev) => ({ ...prev, [u.id]: false }));
    }
  };

  const handleDeleteUser = async (u: AdminParticipant) => {
    if (!confirm(`Permanently delete ${u.name || u.email}? This removes their user record and participant entry.`)) return;
    setRowBusy((prev) => ({ ...prev, [u.id]: true }));
    try {
      await deleteDoc(doc(db, 'users', u.id));
      if (u.isParticipant) {
        await deleteDoc(doc(db, 'participants', u.id));
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (selectedUser?.id === u.id) setSelectedUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${u.id}`);
    } finally {
      setRowBusy((prev) => ({ ...prev, [u.id]: false }));
    }
  };

  const filteredUsers = searchTerm.trim()
    ? users.filter(u => {
        const term = searchTerm.trim().toLowerCase();
        return (u.email || '').toLowerCase().includes(term) ||
               (u.name || '').toLowerCase().includes(term);
      })
    : users;

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

      <div className="relative">
        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name or email (loaded users only)..."
          className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 pl-14 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors shadow-sm"
        />
      </div>

      {error && (
        <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-24 text-center text-slate-400 font-bold flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin" />
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-24 text-center text-slate-400 font-bold">
            No users found{searchTerm ? ` for "${searchTerm}"` : ''}.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredUsers.map((u) => (
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
                  {u.isParticipant && (
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg uppercase">Participant</span>
                  )}
                  {u.role === 'admin' && (
                    <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-1 rounded-lg uppercase">Admin</span>
                  )}
                  {u.status === 'suspended' && (
                    <span className="text-[10px] font-black bg-rose-100 text-rose-700 px-2 py-1 rounded-lg uppercase">Suspended</span>
                  )}
                  <span className="text-xs font-bold text-slate-400">{formatDate(u.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && hasMore && (
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
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                      {selectedUser.name || 'Unnamed'}
                      {selectedUser.status === 'suspended' && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                          Suspended
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-400 font-medium flex items-center gap-1">
                      <Mail size={12} />
                      {selectedUser.email || 'No email on file'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button onClick={() => startEdit(selectedUser)} className="text-slate-400 hover:text-blue-600 transition-colors">
                      <Pencil size={20} />
                    </button>
                  )}
                  <button onClick={() => { setSelectedUser(null); setIsEditing(false); }} className="text-slate-300 hover:text-slate-600 transition-colors">
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Admin management actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleToggleRole(selectedUser)}
                  disabled={rowBusy[selectedUser.id]}
                  className={`flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl uppercase transition-colors disabled:opacity-50 ${
                    selectedUser.role === 'admin' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {selectedUser.role === 'admin' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                  {selectedUser.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                </button>
                <button
                  onClick={() => handleToggleSuspend(selectedUser)}
                  disabled={rowBusy[selectedUser.id]}
                  className={`flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl uppercase transition-colors disabled:opacity-50 ${
                    selectedUser.status === 'suspended' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  <Ban size={14} />
                  {selectedUser.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
                <button
                  onClick={() => handleDeleteUser(selectedUser)}
                  disabled={rowBusy[selectedUser.id]}
                  className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl uppercase bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>

              {isEditing ? (
                <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <EditField label="Name" value={editForm.name || ''} onChange={(v) => setEditForm({ ...editForm, name: v })} />
                    <EditField label="Email" value={editForm.email || ''} onChange={(v) => setEditForm({ ...editForm, email: v })} />
                    <EditField label="Golf Club" value={editForm.golfClub || ''} onChange={(v) => setEditForm({ ...editForm, golfClub: v })} />
                    <EditField label="Course" value={editForm.course || ''} onChange={(v) => setEditForm({ ...editForm, course: v })} />
                    <EditField
                      label="Handicap"
                      value={String(editForm.handicap ?? '')}
                      onChange={(v) => setEditForm({ ...editForm, handicap: parseFloat(v) || 0 })}
                      type="number"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 bg-white border-2 border-slate-200 text-slate-600 p-3 rounded-xl font-black uppercase text-xs hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
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
              )}

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

              <div className="border-t border-slate-100 pt-6">
                {selectedUser.isParticipant ? (
                  <div className="flex items-center justify-center gap-2 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 px-4 py-4 rounded-2xl font-black text-sm">
                    <CheckCircle size={18} />
                    PARTICIPANT
                  </div>
                ) : (
                  <button
                    onClick={() => handleMakeParticipant(selectedUser)}
                    disabled={makingParticipant[selectedUser.id] === 'loading'}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-2xl font-black text-sm hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {makingParticipant[selectedUser.id] === 'loading' ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : makingParticipant[selectedUser.id] === 'success' ? (
                      <CheckCircle size={18} />
                    ) : (
                      <UserPlus size={18} />
                    )}
                    {makingParticipant[selectedUser.id] === 'loading'
                      ? 'MAKING PARTICIPANT...'
                      : makingParticipant[selectedUser.id] === 'success'
                        ? 'MADE PARTICIPANT!'
                        : makingParticipant[selectedUser.id] === 'error'
                          ? 'FAILED - TRY AGAIN'
                          : 'MAKE PARTICIPANT'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
      />
    </div>
  );
}