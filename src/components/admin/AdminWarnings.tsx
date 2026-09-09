import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { AlertTriangle, Plus, Trash2, CheckCircle } from 'lucide-react';
import { AdminWarning } from '../../types';

const SEVERITY_STYLES: Record<AdminWarning['severity'], string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
};

export function AdminWarnings() {
  const [warnings, setWarnings] = useState<AdminWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    targetType: 'participant' as AdminWarning['targetType'],
    targetName: '',
    reason: '',
    severity: 'medium' as AdminWarning['severity'],
  });

  useEffect(() => {
    const q = query(collection(db, 'warnings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setWarnings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminWarning)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'warnings');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reason.trim()) return;
    try {
      await addDoc(collection(db, 'warnings'), {
        ...form,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'unknown',
        resolved: false,
      });
      setForm({ targetType: 'participant', targetName: '', reason: '', severity: 'medium' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'warnings');
    }
  };

  const handleResolve = async (w: AdminWarning) => {
    try {
      await updateDoc(doc(db, 'warnings', w.id), { resolved: !w.resolved });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `warnings/${w.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this warning log entry?')) return;
    try {
      await deleteDoc(doc(db, 'warnings', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `warnings/${id}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <form onSubmit={handleCreate} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm space-y-4 h-fit">
        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
          <Plus size={18} /> Log a Warning
        </h3>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Target Type</label>
          <select
            value={form.targetType}
            onChange={(e) => setForm({ ...form, targetType: e.target.value as AdminWarning['targetType'] })}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
          >
            <option value="participant">Participant</option>
            <option value="score">Score</option>
            <option value="sponsor">Sponsor</option>
            <option value="general">General</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Target Name (optional)</label>
          <input
            value={form.targetName}
            onChange={(e) => setForm({ ...form, targetName: e.target.value })}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
            placeholder="e.g. golfer or club name"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Severity</label>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as AdminWarning['severity'] })}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Reason</label>
          <textarea
            required
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={4}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none resize-none"
          />
        </div>
        <button type="submit" className="w-full bg-rose-600 text-white p-3 rounded-xl font-black uppercase text-sm hover:bg-rose-700 transition-colors">
          Log Warning
        </button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        {loading ? (
          <div className="text-slate-400 font-bold p-8 text-center">Loading...</div>
        ) : warnings.length === 0 ? (
          <div className="text-slate-400 font-bold p-8 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-2">
            <AlertTriangle size={28} className="opacity-40" />
            No warnings logged.
          </div>
        ) : (
          warnings.map((w) => (
            <div key={w.id} className={`bg-white p-5 rounded-2xl border shadow-sm flex items-start justify-between gap-4 ${w.resolved ? 'opacity-50' : 'border-slate-100'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${SEVERITY_STYLES[w.severity]}`}>
                    {w.severity}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    {w.targetType}
                  </span>
                  {w.targetName && <span className="font-black text-slate-900">{w.targetName}</span>}
                </div>
                <p className="text-sm text-slate-600 font-medium mt-2">{w.reason}</p>
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
                  {new Date(w.createdAt).toLocaleString()} {w.createdBy ? `· ${w.createdBy}` : ''}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleResolve(w)} className={w.resolved ? 'text-emerald-500 p-2' : 'text-slate-400 hover:text-emerald-500 p-2'}>
                  <CheckCircle size={16} />
                </button>
                <button onClick={() => handleDelete(w.id)} className="text-slate-400 hover:text-rose-500 p-2">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
