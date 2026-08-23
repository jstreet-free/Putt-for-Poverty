import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { LogIn, ArrowRight, ShieldCheck, Trophy, Users } from 'lucide-react';

export function Login({ user }: { user: any }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to send the user after a successful sign-in.
  // Supports being sent here with a "next" location (e.g. from the Leaderboard CTA).
  const redirectTo = (location.state as { from?: string })?.from || '/register';

  // If they're already signed in (e.g. navigated here directly), skip straight through.
  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, redirectTo, navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `Sign-in failed: ${err.message}`
          : 'Sign-in failed. Please try again.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left: pitch / context */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-8"
        >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-full text-emerald-700 font-bold text-xs tracking-widest uppercase">
              <Trophy size={14} />
              Putt for Poverty
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.05]">
              Join the <span className="text-emerald-600 italic">event</span>
            </h1>
            <p className="text-lg text-slate-500 font-medium leading-relaxed">
              Sign in with Google to register your profile, submit scores, and appear on the world leaderboard.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              { icon: Users, text: 'Set up your golfer profile' },
              { icon: Trophy, text: 'Track your rounds and score' },
              { icon: ShieldCheck, text: '100% of your entry goes to charity' },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-600 font-semibold">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <item.icon size={18} />
                </div>
                {item.text}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Right: sign-in card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 md:p-10 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-6"
        >
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sign in to continue</h2>
            <p className="text-sm text-slate-500 font-medium">
              New here? Signing in with Google also creates your account.
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white p-5 rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50"
          >
            <LogIn size={20} />
            {isSigningIn ? 'SIGNING IN...' : 'CONTINUE WITH GOOGLE'}
          </button>

          <p className="text-[11px] text-slate-400 font-medium text-center leading-relaxed">
            By continuing you agree to the event{' '}
            <Link to="/rules" className="text-emerald-600 font-bold hover:underline">
              rules
            </Link>{' '}
            and the free@last privacy policy.
          </p>

          <div className="pt-2 border-t border-slate-100 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-emerald-600 transition-colors"
            >
              Back to home
              <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}