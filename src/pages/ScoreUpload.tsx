import { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, collection, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import { Trophy, Target, CheckCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export function ScoreUpload({ user, participant }: { user: any, participant: any }) {
  const navigate = useNavigate();
  const [totalPoints, setTotalPoints] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalPoints === '' || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'scores'), {
        participantId: user.uid,
        name: participant.name,
        points: totalPoints,
        submittedAt: serverTimestamp(),
        golfClub: participant.golfClub,
      });

      await updateDoc(doc(db, 'participants', user.uid), {
        score: totalPoints,
        usedRounds: increment(1),
        updatedAt: serverTimestamp(),
      });

      setSubmitted(true);
      setTimeout(() => navigate('/leaderboard'), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'scores');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">SCORE <span className="text-emerald-600">INPUT</span></h1>
        <p className="text-slate-500 font-medium">Uploading your round for June 21-22.</p>
      </div>

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white p-8 md:p-12 rounded-[2rem] border-2 border-slate-100 shadow-2xl space-y-8"
          >
            <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm">
                  <Target size={24} />
               </div>
               <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Authenticated For</div>
                  <div className="font-black text-slate-800 text-lg">{participant?.golfClub} - Handicap {participant?.handicap}</div>
               </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
               <div className="space-y-4">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1 block text-center">Total Points</label>
                  <div className="flex justify-center">
                    <input 
                      type="number"
                      required
                      min="0"
                      max="100"
                      value={totalPoints}
                      onChange={(e) => setTotalPoints(parseInt(e.target.value))}
                      className="text-7xl font-black text-center w-full max-w-[200px] p-4 bg-emerald-50 border-4 border-emerald-100 rounded-3xl text-emerald-900 focus:border-emerald-500 outline-none transition-all placeholder:text-emerald-200"
                      placeholder="00"
                    />
                  </div>
                  <p className="text-slate-400 text-center text-sm font-bold italic">Calculation: Sum of points across all 18 holes</p>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-start gap-4">
                  <Info className="text-slate-400 shrink-0 mt-1" size={20} />
                  <p className="text-sm font-medium text-slate-500 leading-relaxed">
                    By submitting, you confirm this score was played on <span className="text-slate-900 font-bold">June 21st or 22nd</span> and adheres to the official rules and your registered handicap.
                  </p>
               </div>

               <button 
                type="submit"
                disabled={totalPoints === '' || isSubmitting}
                className="w-full bg-emerald-600 text-white p-6 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
               >
                {isSubmitting ? 'SUBMITTING...' : 'SUBMIT SCORE'}
               </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-emerald-600 p-12 rounded-[2rem] text-white text-center space-y-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="flex justify-center relative z-10">
               <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-24 h-24 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-xl"
               >
                 <CheckCircle size={56} />
               </motion.div>
            </div>
            <div className="space-y-2 relative z-10">
              <h2 className="text-4xl font-black uppercase tracking-tight">Score Recorded!</h2>
              <p className="text-emerald-100 font-medium text-lg italic">Great round! Checking your position on the leaderboard...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
