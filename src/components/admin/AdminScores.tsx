import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { Trophy, Flag, Trash2, Save, AlertTriangle, Plus, Minus } from 'lucide-react';
import { ScoreEntry, Participant } from '../../types';

export function AdminScores() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingScore, setEditingScore] = useState<ScoreEntry | null>(null);
  const [editPoints, setEditPoints] = useState<number>(0);
  const [flagReason, setFlagReason] = useState('');

  useEffect(() => {
    const unsubScores = onSnapshot(
      query(collection(db, 'scores'), orderBy('submittedAt', 'desc')),
      (snap) => {
        setScores(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreEntry)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'scores');
        setLoading(false);
      }
    );
    const unsubParts = onSnapshot(collection(db, 'participants'), (snap) => {
      setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Participant)));
    });
    return () => {
      unsubScores();
      unsubParts();
    };
  }, []);

  const findParticipant = (participantId: string) => participants.find((p) => p.id === participantId || p.userId === participantId);

  const handleStartEdit = (s: ScoreEntry) => {
    setEditingScore(s);
    setEditPoints(s.points);
    setFlagReason(s.flagReason || '');
  };

  const handleSaveEdit = async () => {
    if (!editingScore?.id) return;
    try {
      await updateDoc(doc(db, 'scores', editingScore.id), {
        points: editPoints,
        moderatedAt: new Date().toISOString(),
      });
      // Keep the participant's leaderboard score in sync with the corrected value
      const participant = findParticipant(editingScore.participantId);
      if (participant) {
        await updateDoc(doc(db, 'participants', participant.id), {
          score: editPoints,
          updatedAt: new Date().toISOString(),
        });
      }
      setEditingScore(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scores/${editingScore.id}`);
    }
  };

  const handleToggleFlag = async (s: ScoreEntry) => {
    if (!s.id) return;
    try {
      await updateDoc(doc(db, 'scores', s.id), {
        flagged: !s.flagged,
        flagReason: !s.flagged ? flagReason || 'Flagged for review' : '',
      });
      setEditingScore(null);
      setFlagReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scores/${s.id}`);
    }
  };

  const handleDeleteScore = async (s: ScoreEntry) => {
    if (!s.id || !confirm(`Delete this score entry for ${s.name}? This also frees up their used round.`)) return;
    try {
      await deleteDoc(doc(db, 'scores', s.id));
      const participant = findParticipant(s.participantId);
      if (participant) {
        await updateDoc(doc(db, 'participants', participant.id), {
          usedRounds: increment(-1),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `scores/${s.id}`);
    }
  };

  const handleAdjustRounds = async (p: Participant, field: 'paidRounds' | 'usedRounds', delta: number) => {
    try {
      await updateDoc(doc(db, 'participants', p.id), {
        [field]: increment(delta),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `participants/${p.id}`);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2 mb-1">
          <Trophy size={24} className="text-blue-600" />
          Score Moderation
        </h2>
        <p className="text-slate-500 font-medium text-sm">Review, correct, flag, or remove submitted scores.</p>
      </div>

      <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold">Loading scores...</div>
        ) : scores.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold">No scores submitted yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {scores.map((s) => (
              <div key={s.id} className={`p-5 flex items-center justify-between gap-4 ${s.flagged ? 'bg-rose-50/50' : ''}`}>
                <div className="min-w-0 flex items-center gap-3">
                  {s.flagged && <AlertTriangle size={16} className="text-rose-500 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 truncate">{s.name}</div>
                    <div className="text-xs text-slate-400 font-bold truncate">{s.golfClub}</div>
                    {s.flagged && s.flagReason && <div className="text-xs text-rose-600 font-bold mt-1">⚑ {s.flagReason}</div>}
                  </div>
                </div>

                {editingScore?.id === s.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={editPoints}
                      onChange={(e) => setEditPoints(parseInt(e.target.value) || 0)}
                      className="w-20 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg font-black text-center focus:border-blue-500 outline-none"
                    />
                    <button onClick={handleSaveEdit} className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700">
                      <Save size={16} />
                    </button>
                    <button onClick={() => setEditingScore(null)} className="text-slate-400 text-xs font-bold px-2">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xl font-black text-slate-900 bg-slate-50 px-3 py-1 rounded-lg">{s.points}</span>
                    <button onClick={() => handleStartEdit(s)} className="text-slate-400 hover:text-blue-600 p-2" title="Edit score">
                      <Trophy size={16} />
                    </button>
                    <button onClick={() => handleToggleFlag(s)} className={`p-2 ${s.flagged ? 'text-rose-600' : 'text-slate-400 hover:text-rose-500'}`} title="Flag for review">
                      <Flag size={16} />
                    </button>
                    <button onClick={() => handleDeleteScore(s)} className="text-slate-400 hover:text-rose-500 p-2" title="Delete score">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-1">Round Adjustments</h3>
        <p className="text-slate-500 font-medium text-sm mb-4">Manually correct paid/used round counts (e.g. failed payment sync, refund).</p>
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Golfer</th>
                <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Paid Rounds</th>
                <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Used Rounds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {participants.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-bold text-slate-800">{p.name}</td>
                  <td className="px-6 py-3">
                    <RoundAdjuster value={p.paidRounds || 0} onAdjust={(d) => handleAdjustRounds(p, 'paidRounds', d)} />
                  </td>
                  <td className="px-6 py-3">
                    <RoundAdjuster value={p.usedRounds || 0} onAdjust={(d) => handleAdjustRounds(p, 'usedRounds', d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoundAdjuster({ value, onAdjust }: { value: number; onAdjust: (delta: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={() => onAdjust(-1)} disabled={value <= 0} className="bg-slate-100 text-slate-500 rounded-lg p-1.5 hover:bg-slate-200 disabled:opacity-30">
        <Minus size={12} />
      </button>
      <span className="font-black text-slate-800 w-6 text-center">{value}</span>
      <button onClick={() => onAdjust(1)} className="bg-slate-100 text-slate-500 rounded-lg p-1.5 hover:bg-slate-200">
        <Plus size={12} />
      </button>
    </div>
  );
}
