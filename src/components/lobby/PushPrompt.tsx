import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Share } from 'lucide-react';
import { enablePush, getPushStatus, PushStatus, registerDevice } from '../../lib/pushNotifications';

const FAILED = "Couldn't turn on notifications. Check your connection and try again.";

export function PushPrompt({ uid }: { uid: string }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPushStatus()
      .then(async (next) => {
        if (active) setStatus(next);
        if (next === 'enabled') await registerDevice(uid);
      })
      .catch((err) => {
        console.warn('Could not register for notifications:', err);
        if (active) setError(FAILED);
      });
    return () => { active = false; };
  }, [uid]);

  const handleEnable = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await enablePush(uid));
    } catch (err) {
      console.warn('Could not turn on notifications:', err);
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  if (status === null || status === 'unsupported') return null;

  if (status === 'needs-install') {
    return (
      <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 flex gap-3">
        <Share size={18} className="shrink-0 mt-0.5 text-emerald-600" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-700">Get score alerts on your iPhone</p>
          <p className="text-xs text-slate-500 font-medium">
            Tap Share in Safari, choose Add to Home Screen, then open the app from your Home Screen and sign in there.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 flex gap-3">
        <BellOff size={18} className="shrink-0 mt-0.5 text-slate-400" />
        <p className="text-xs text-slate-500 font-medium">
          Notifications are blocked for this site. Allow them in your phone or browser settings to get score alerts.
        </p>
      </div>
    );
  }

  if (status === 'enabled' && !error) {
    return (
      <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 justify-center">
        <Bell size={12} />
        Score alerts are on for this device
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleEnable}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-3 rounded-xl font-black text-xs uppercase hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        Turn on score alerts
      </button>
      {error && <p className="text-xs text-rose-600 font-bold text-center">{error}</p>}
    </div>
  );
}
