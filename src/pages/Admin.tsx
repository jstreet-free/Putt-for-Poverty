import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Participant, Sponsor } from '../types';
import { Users, Trophy, MapPin, Plus, Trash2, Edit2, ShieldCheck, CreditCard, Layout, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

export function Admin({ user, participant }: { user: any, participant: any }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Partial<Sponsor> | null>(null);

  useEffect(() => {
    const unsubParts = onSnapshot(collection(db, 'participants'), (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Participant)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'participants'));

    const unsubSponsors = onSnapshot(query(collection(db, 'sponsors'), orderBy('order', 'asc')), (snap) => {
      setSponsors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sponsor)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sponsors'));

    return () => { unsubParts(); unsubSponsors(); };
  }, []);

  const handleToggleAdmin = async (p: Participant) => {
    const newRole = p.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Make ${p.name} ${newRole === 'admin' ? 'an admin' : 'a regular user'}?`)) return;
    try {
      // role now lives on the `users` collection, not `participants`
      await setDoc(doc(db, 'users', p.id), { role: newRole }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${p.id}`);
    }
  };

  const handleSaveSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSponsor?.name) return;
    try {
      const id = editingSponsor.id || `sponsor_${Date.now()}`;
      await setDoc(doc(db, 'sponsors', id), {
        ...editingSponsor,
        id,
        order: editingSponsor.order || sponsors.length + 1
      }, { merge: true });
      setShowSponsorModal(false);
      setEditingSponsor(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sponsors');
    }
  };

  const handleDeleteSponsor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sponsor?')) return;
    try {
      await deleteDoc(doc(db, 'sponsors', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sponsors/${id}`);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500 font-bold">Initialising Admin Control Hub...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight">ADMIN <span className="text-blue-600">HUB</span></h1>
          <p className="text-slate-500 font-medium">Monitoring the global Putt for Poverty leaderboard & participants.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-3">
            <Users className="text-blue-500" />
            <div>
              <div className="text-xl font-black">{participants.length}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Golfers</div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-3">
            <CreditCard className="text-emerald-500" />
            <div>
              <div className="text-xl font-black">£{(participants.reduce((acc, p) => acc + (p.paidRounds || 0), 0) * 20).toLocaleString()}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Funds Raised</div>
            </div>
          </div>
          <Link
            to="/admin/users"
            className="bg-slate-900 text-white px-5 py-3 rounded-3xl font-black text-sm hover:bg-blue-600 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <Users size={18} />
            USER DIRECTORY
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Participants Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
              <Users size={24} className="text-blue-600" />
              Registered Participants
            </h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Golfer</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Club & Course</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Rounds</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-600">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-400 font-medium">Hcp: {p.handicap}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-800">{p.golfClub}</div>
                        <div className="text-xs text-slate-400 font-medium">{p.course}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-xs font-black">
                          {p.usedRounds || 0} / {p.paidRounds || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate max-w-[150px]">{p.location?.label || 'Not set'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggleAdmin(p)}
                          className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
                            p.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {p.role === 'admin' ? 'Admin' : 'Make Admin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sponsors Management */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
              <ShieldCheck size={24} className="text-emerald-600" />
              Sponsors
            </h2>
            <button 
              onClick={() => { setEditingSponsor({ order: sponsors.length + 1 }); setShowSponsorModal(true); }}
              className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="space-y-4">
            {sponsors.map((s) => (
              <div key={s.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-md group">
                <div className="flex items-center justify-between gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center p-2">
                    <img src={s.logo} alt={s.name} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{s.name}</div>
                    <div className="text-xs text-slate-400 font-medium truncate">{s.tagline}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => { setEditingSponsor(s); setShowSponsorModal(true); }}
                      className="text-slate-400 hover:text-blue-500 p-1"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteSponsor(s.id)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {sponsors.length === 0 && (
              <div className="text-center p-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                <Layout size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs font-bold uppercase tracking-widest">No Sponsors Yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sponsor Modal */}
      <AnimatePresence>
        {showSponsorModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSponsorModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-8"
            >
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
                {editingSponsor?.id ? 'EDIT SPONSOR' : 'ADD NEW SPONSOR'}
              </h3>
              <form onSubmit={handleSaveSponsor} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sponsor Name</label>
                    <input 
                      required
                      value={editingSponsor?.name || ''}
                      onChange={e => setEditingSponsor({...editingSponsor, name: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Logo URL</label>
                    <input 
                      required
                      value={editingSponsor?.logo || ''}
                      onChange={e => setEditingSponsor({...editingSponsor, logo: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tagline</label>
                    <input 
                      value={editingSponsor?.tagline || ''}
                      onChange={e => setEditingSponsor({...editingSponsor, tagline: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Display Order</label>
                      <input 
                        type="number"
                        value={editingSponsor?.order || ''}
                        onChange={e => setEditingSponsor({...editingSponsor, order: parseInt(e.target.value)})}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowSponsorModal(false)}
                    className="flex-1 bg-slate-100 text-slate-600 p-4 rounded-2xl font-black uppercase text-sm hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-blue-600 text-white p-4 rounded-2xl font-black uppercase text-sm hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    SAVE SPONSOR
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}