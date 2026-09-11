import { useState, useEffect } from 'react';
import { Calendar, Save, CheckCircle } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { EventSettings } from '../../types';
import { subscribeToEventSettings, updateEventSettings, DEFAULT_EVENT_SETTINGS } from '../../lib/eventSettingsService';

export function AdminEventSettings() {
  const [settings, setSettings] = useState<EventSettings>(DEFAULT_EVENT_SETTINGS);
  const [form, setForm] = useState<EventSettings>(DEFAULT_EVENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = subscribeToEventSettings((s) => {
      setSettings(s);
      setForm(s);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await updateEventSettings(
      {
        dateLabel: form.dateLabel,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      },
      auth.currentUser?.email || undefined
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const isDirty =
    form.dateLabel !== settings.dateLabel || form.startDate !== settings.startDate || form.endDate !== settings.endDate;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
          <Calendar size={24} className="text-blue-600" />
          Event Settings
        </h2>
        <p className="text-slate-500 font-medium text-sm">Controls the date badge shown on the homepage hero.</p>
      </div>

      {loading ? (
        <div className="text-slate-400 font-bold p-8 text-center bg-white rounded-3xl border-2 border-slate-100">Loading...</div>
      ) : (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Display Text</label>
            <input
              required
              value={form.dateLabel}
              onChange={(e) => setForm({ ...form, dateLabel: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
              placeholder="e.g. September 2nd - 3rd, 2026"
            />
            <p className="text-[10px] text-slate-400 font-medium pl-1">Shown exactly as typed in the hero badge on the homepage.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Start Date (optional)</label>
              <input
                type="date"
                value={form.startDate ? form.startDate.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">End Date (optional)</label>
              <input
                type="date"
                value={form.endDate ? form.endDate.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            If you set an End Date and it passes without the Display Text being updated to a new future date, the
            homepage automatically shows "Next event is coming soon" instead of the stale date. Leave End Date
            blank to skip this and always show the Display Text as-is.
          </p>

          <button
            type="submit"
            disabled={!isDirty || saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </form>
      )}
    </div>
  );
}