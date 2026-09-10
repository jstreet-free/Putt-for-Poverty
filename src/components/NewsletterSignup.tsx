import { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';

export function NewsletterSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || status === 'submitting') return;
    setStatus('submitting');
    try {
      await addDoc(collection(db, 'newsletter_subscribers'), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subscribedAt: new Date().toISOString(),
      });
      setStatus('success');
      setName('');
      setEmail('');
    } catch (err) {
      console.error('Newsletter signup failed:', err);
      setStatus('error');
    }
  };

  return (
    <section className="max-w-4xl mx-auto px-4">
      <div className="bg-emerald-900 rounded-[3rem] p-10 md:p-16 text-white text-center space-y-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/40 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 space-y-6">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto">
            <Mail size={26} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Stay In The Loop</h2>
            <p className="text-emerald-100 font-medium max-w-md mx-auto">
              Get event updates, fundraising milestones, and news from free@last straight to your inbox.
            </p>
          </div>

          {status === 'success' ? (
            <div className="flex items-center justify-center gap-2 bg-emerald-800/40 border border-emerald-400/30 text-emerald-100 px-6 py-4 rounded-2xl font-bold max-w-md mx-auto">
              <CheckCircle size={20} />
              You're subscribed! Thanks for joining.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="flex-1 bg-white/10 border-2 border-white/20 rounded-2xl p-4 font-bold text-white placeholder:text-emerald-200/60 focus:border-white/50 outline-none transition-colors"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-white/10 border-2 border-white/20 rounded-2xl p-4 font-bold text-white placeholder:text-emerald-200/60 focus:border-white/50 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="flex items-center justify-center gap-2 bg-white text-emerald-900 px-6 py-4 rounded-2xl font-black uppercase text-sm hover:bg-emerald-50 transition-all disabled:opacity-50 shrink-0"
              >
                {status === 'submitting' ? <Loader2 size={18} className="animate-spin" /> : 'Subscribe'}
              </button>
            </form>
          )}
          {status === 'error' && (
            <p className="text-rose-200 font-bold text-sm">Something went wrong — please try again.</p>
          )}
        </div>
      </div>
    </section>
  );
}
