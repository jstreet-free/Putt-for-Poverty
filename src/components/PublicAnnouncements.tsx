import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Megaphone, Pin, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Announcement } from '../types';

export function PublicAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(6));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
        // Pinned items float to the top, otherwise newest first
        list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
          <Megaphone size={14} />
          Latest Updates
        </div>
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">News From The Event</h2>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 font-bold py-8">Loading updates...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col"
            >
              {a.imageUrl && (
                <div className="h-40 w-full overflow-hidden bg-slate-100">
                  <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-6 space-y-3 flex-1 flex flex-col">
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin size={14} className="text-orange-500 shrink-0" />}
                  <h3 className="font-black text-slate-900 leading-snug">{a.title}</h3>
                </div>
                <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1 line-clamp-4">{a.content}</p>
                {a.linkUrl && (
                  <a
                    href={a.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-black text-emerald-600 hover:text-emerald-800"
                  >
                    {a.linkText || 'Learn More'}
                    <ArrowRight size={14} />
                  </a>
                )}
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest pt-2">
                  {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
