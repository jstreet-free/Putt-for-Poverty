import { db } from './firebase';
import {
  doc,
  setDoc,
  increment,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { DailyAppStats } from '../types';

export type VisitRole = 'user' | 'admin' | 'public';

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fire-and-forget visit logger. Increments a single per-day document rather
 * than writing one doc per visit, so this stays cheap at any traffic volume.
 */
export async function logVisit(role: VisitRole = 'public', page: string = 'home') {
  const key = getTodayKey();
  const ref = doc(db, 'dailyAppStats', key);
  const safePage = page.replace(/[.$/[\]#]/g, '_') || 'home';
  try {
    await setDoc(
      ref,
      {
        date: key,
        totalVisits: increment(1),
        [`roleBreakdown.${role}`]: increment(1),
        [`pageViews.${safePage}`]: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    // Analytics should never break the app for the visitor
    console.warn('Visit logging failed:', e);
  }
}

export function subscribeToDailyAppStats(
  cb: (stats: DailyAppStats[]) => void,
  daysBack: number = 60
) {
  const q = query(collection(db, 'dailyAppStats'), orderBy('date', 'desc'), limit(daysBack));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          date: data.date || d.id,
          totalVisits: data.totalVisits || 0,
          roleBreakdown: {
            user: data.roleBreakdown?.user || 0,
            admin: data.roleBreakdown?.admin || 0,
            public: data.roleBreakdown?.public || 0,
          },
          pageViews: data.pageViews || {},
        } as DailyAppStats;
      });
      cb(list);
    },
    (err) => console.warn('Failed to load daily app stats:', err)
  );
}

export function exportStatsCsv(stats: DailyAppStats[]): string {
  const header = 'date,totalVisits,user,admin,public';
  const rows = stats.map(
    (s) =>
      `${s.date},${s.totalVisits || 0},${s.roleBreakdown?.user || 0},${s.roleBreakdown?.admin || 0},${s.roleBreakdown?.public || 0}`
  );
  return [header, ...rows].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
