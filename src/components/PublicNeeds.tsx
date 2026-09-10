import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { HeartHandshake, Users, Gift, Wrench, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { CommunityNeed } from '../types';

const CATEGORY_ICON: Record<CommunityNeed['category'], any> = {
  volunteers: Users,
  sponsorship: Gift,
  equipment: Wrench,
  other: Sparkles,
};

export function PublicNeeds() {
  const [needs, setNeeds] = useState<CommunityNeed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'needs'), orderBy('date', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CommunityNeed))
          .filter((n) => !n.resolved);
        setNeeds(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  if (!loading && needs.length === 0) return null;

  return (
    <section className="bg-slate-50 py-20">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
            <HeartHandshake size={14} />
            How You Can Help
          </div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Current Needs</h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            free@last relies on volunteers and support beyond the tournament itself. Here's what's needed right now.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-slate-400 font-bold py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {needs.map((n, i) => {
              const Icon = CATEGORY_ICON[n.category] || Sparkles;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3"
                >
                  <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center">
                    <Icon size={22} />
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-orange-500">{n.category}</div>
                  <h3 className="font-black text-slate-900 leading-snug">{n.title}</h3>
                  {n.description && <p className="text-sm text-slate-500 font-medium leading-relaxed">{n.description}</p>}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
