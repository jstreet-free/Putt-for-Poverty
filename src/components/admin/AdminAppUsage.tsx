import { useState, useEffect, useMemo } from 'react';
import { Activity, Download, Users as UsersIcon, Eye } from 'lucide-react';
import { DailyAppStats } from '../../types';
import { subscribeToDailyAppStats, exportStatsCsv, downloadCsv } from '../../lib/analyticsService';

export function AdminAppUsage() {
  const [stats, setStats] = useState<DailyAppStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | 'all'>('14d');

  useEffect(() => {
    const unsub = subscribeToDailyAppStats((s) => {
      setStats(s);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredStats = useMemo(() => {
    const daysLimit = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : timeRange === '30d' ? 30 : 999;
    return stats.slice(0, daysLimit);
  }, [stats, timeRange]);

  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, s) => {
        acc.totalVisits += s.totalVisits || 0;
        acc.user += s.roleBreakdown?.user || 0;
        acc.admin += s.roleBreakdown?.admin || 0;
        acc.public += s.roleBreakdown?.public || 0;
        return acc;
      },
      { totalVisits: 0, user: 0, admin: 0, public: 0 }
    );
  }, [filteredStats]);

  const maxVisits = Math.max(1, ...filteredStats.map((s) => s.totalVisits || 0));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
            <Activity size={24} className="text-blue-600" />
            Daily App Usage
          </h2>
          <p className="text-slate-500 font-medium text-sm">Visits and role breakdown over time.</p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '14d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
                timeRange === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {r === 'all' ? 'All Time' : r}
            </button>
          ))}
          <button
            onClick={() => downloadCsv(`app-usage-${timeRange}.csv`, exportStatsCsv(filteredStats))}
            className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-600 transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Eye} label="Total Visits" value={totals.totalVisits} />
        <StatCard icon={UsersIcon} label="Signed-in Users" value={totals.user} color="text-emerald-600" />
        <StatCard icon={UsersIcon} label="Admin Visits" value={totals.admin} color="text-blue-600" />
        <StatCard icon={UsersIcon} label="Public Visits" value={totals.public} color="text-slate-500" />
      </div>

      <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl p-6">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold">Loading usage data...</div>
        ) : filteredStats.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold">
            No visits recorded yet. Data appears once visitors start using the app.
          </div>
        ) : (
          <div className="space-y-2">
            {[...filteredStats].reverse().map((s) => (
              <div key={s.id} className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-400 w-24 shrink-0">{s.date}</span>
                <div className="flex-1 bg-slate-50 rounded-lg h-6 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-lg transition-all"
                    style={{ width: `${((s.totalVisits || 0) / maxVisits) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-black text-slate-700 w-10 text-right shrink-0">{s.totalVisits || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = 'text-slate-700' }: { icon: any; label: string; value: number; color?: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1">
      <Icon size={18} className={color} />
      <div className={`text-2xl font-black ${color}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
    </div>
  );
}
