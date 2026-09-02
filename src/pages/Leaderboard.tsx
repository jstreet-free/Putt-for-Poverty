import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { Trophy, Medal, User, Flag, ArrowUp, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { Participant } from '../types';
import type { User as FirebaseUser } from 'firebase/auth';

export function Leaderboard({ user }: { user: FirebaseUser | null }) {
  const navigate = useNavigate();
  const [scores, setScores] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'participants'),
      orderBy('score', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Participant[];
      const filtered = data.filter(p => p.score !== undefined);
      setScores(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'participants');
    });

    return () => unsubscribe();
  }, []);

  const getRankIcon = (index: number) => {
    switch(index) {
      case 0: return <Trophy className="text-amber-500" size={24} />;
      case 1: return <Medal className="text-slate-400" size={24} />;
      case 2: return <Medal className="text-amber-700" size={24} />;
      default: return <span className="text-slate-400 font-bold">{index + 1}</span>;
    }
  };

  const handleGetReadyToPlay = () => {
    if (user) {
      navigate('/register');
    } else {
      navigate('/login', { state: { from: '/register' } });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
           Live Tournament Standings
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">LEADER<span className="text-emerald-600">BOARD</span></h1>
        <p className="text-slate-500 font-medium text-lg">Scoring window: September 2nd 00:01 - September 3rd 23:59</p>
      </div>

      <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 bg-slate-50 border-b-2 border-slate-100 flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-widest">
           <div className="flex items-center gap-12 pl-4">
             <span className="w-8">Rank</span>
             <span>Player</span>
           </div>
           <div className="flex items-center gap-12 pr-4">
             <span className="hidden md:block">Handicap</span>
             <span>Points</span>
           </div>
        </div>

        <div className="divide-y divide-slate-100">
          {scores.length > 0 ? scores.map((player, index) => (
            <motion.div 
              key={player.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "p-6 flex items-center justify-between group hover:bg-slate-50 transition-colors",
                index < 3 ? "bg-emerald-50/30" : ""
              )}
            >
              <div className="flex items-center gap-8 md:gap-12 pl-4">
                <div className="w-8 flex justify-center">
                  {getRankIcon(index)}
                </div>
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden">
                      <User className="text-slate-400" size={24} />
                   </div>
                   <div className="flex flex-col">
                      <span className="font-black text-slate-800 text-lg group-hover:text-emerald-700 transition-colors">{player.name}</span>
                      <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                        <Flag size={12} />
                        {player.golfClub}
                      </span>
                   </div>
                </div>
              </div>
              
              <div className="flex items-center gap-8 md:gap-12 pr-4">
                <span className="hidden md:block font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-lg text-sm">{player.handicap}</span>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-slate-900">{player.score}</span>
                  <div className="flex flex-col">
                    <ArrowUp className="text-emerald-500" size={14} />
                  </div>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="p-24 text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <Trophy size={40} />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-black text-slate-800">No scores yet!</p>
                <p className="text-slate-500 font-medium">The scoreboard will spring to life on September 2nd.</p>
              </div>
              <button
                onClick={handleGetReadyToPlay}
                className="inline-block mt-4 bg-emerald-600 text-white px-8 py-3 rounded-full font-bold hover:bg-emerald-700 transition-colors"
              >
                Get Ready to Play
              </button>
            </div>
          )}
        </div>
      </div>


      <div className="bg-emerald-900 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center gap-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/50 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="bg-emerald-800 p-4 rounded-2xl">
          <Info size={32} />
        </div>
        <div className="flex-1 space-y-1 text-center md:text-left">
          <h3 className="text-xl font-black">Top 3 Prize Announcement</h3>
          <p className="text-emerald-200 font-medium">The official trophy ceremony will take place via live stream on June 23rd. Final scores are subject to handicap verification.</p>
        </div>
        <div className="hidden lg:block">
           <Trophy size={64} className="opacity-20 rotate-12" />
        </div>
      </div>
    </div>
  );
}