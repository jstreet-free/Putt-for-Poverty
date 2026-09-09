import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { Megaphone, Plus, Trash2, CheckCircle, Circle } from 'lucide-react';
import { CommunityNeed } from '../../types';

const CATEGORIES: CommunityNeed['category'][] = ['volunteers', 'sponsorship', 'equipment', 'other'];

export function AdminNeeds() {
  const [needs, setNeeds] = useState<CommunityNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', category: 'volunteers' as CommunityNeed['category'], description: '' });

  useEffect(() => {
    const q = query(collection(db, 'needs'), orderBy('date', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNeeds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityNeed)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'needs');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await addDoc(collection(db, 'needs'), {
        ...form,
        date: new Date().toISOString(),
        resolved: false,
      });
      setForm({ title: '', category: 'volunteers', description: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'needs');
    }
  };

  const handleToggleResolved = async (n: CommunityNeed) => {
    try {
      await updateDoc(doc(db, 'needs', n.id), { resolved: !n.resolved });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `needs/${n.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this need?')) return;
    try {
      await deleteDoc(doc(db, 'needs', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `needs/${id}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <form onSubmit={handleCreate} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm space-y-4 h-fit">
        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
          <Plus size={18} /> Post a Need
        </h3>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
            placeholder="e.g. Need 3 volunteers on Sept 2nd"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as CommunityNeed['category'] })}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none resize-none"
          />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-colors">
          Broadcast Need
        </button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        {loading ? (
          <div className="text-slate-400 font-bold p-8 text-center">Loading...</div>
        ) : needs.length === 0 ? (
          <div className="text-slate-400 font-bold p-8 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-2">
            <Megaphone size={28} className="opacity-40" />
            No needs posted yet.
          </div>
        ) : (
          needs.map((n) => (
            <div
              key={n.id}
              className={`bg-white p-5 rounded-2xl border shadow-sm flex items-start justify-between gap-4 ${
                n.resolved ? 'border-emerald-100 opacity-60' : 'border-slate-100'
              }`}
            >
              <div className="min-w-0 flex items-start gap-3">
                <button onClick={() => handleToggleResolved(n)} className="mt-1 shrink-0">
                  {n.resolved ? <CheckCircle size={18} className="text-emerald-500" /> : <Circle size={18} className="text-slate-300" />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900">{n.title}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      {n.category}
                    </span>
                  </div>
                  {n.description && <p className="text-sm text-slate-500 font-medium mt-1">{n.description}</p>}
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
                    {new Date(n.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(n.id)} className="text-slate-400 hover:text-rose-500 p-2 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
