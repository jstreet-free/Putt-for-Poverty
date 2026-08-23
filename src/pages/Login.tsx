import { useEffect, useState } from 'react';
import { auth, db, storage } from '../lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogIn, ArrowRight, ShieldCheck, Trophy, Users,
  Mail, Lock, Upload, FileCheck, Loader2,
} from 'lucide-react';

type Mode = 'login' | 'signup';

export function Login({ user }: { user: any }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [membershipFile, setMembershipFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string })?.from || '/register';

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, redirectTo, navigate]);

  const resetError = () => {
    setError(null);
    setResetMessage(null);
  };

  const handlePasswordReset = async () => {
    resetError();
    if (!email) {
      setError('Enter your email address first.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Password reset failed: ${err.message}` : 'Password reset failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    resetError();
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Sign-in failed: ${err.message}` : 'Sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetError();
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Login failed: ${err.message}` : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    resetError();
    setIsSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      if (membershipFile) {
        const fileRef = ref(storage, `membership-proofs/${cred.user.uid}/${membershipFile.name}`);
        await uploadBytes(fileRef, membershipFile);
        const url = await getDownloadURL(fileRef);
        await setDoc(doc(db, 'participants', cred.user.uid), {
          userId: cred.user.uid,
          membershipProofUrl: url,
          membershipProofFileName: membershipFile.name,
          membershipProofUploadedAt: new Date().toISOString(),
        }, { merge: true });
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Sign-up failed: ${err.message}` : 'Sign-up failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    resetError();
    setShowEmailLogin(false);
    setPassword('');
    setMembershipFile(null);
    setMode(next);
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
              {mode === 'login' ? (
                <>Welcome <span className="text-emerald-600 italic">back</span></>
              ) : (
                <>Join the <span className="text-emerald-600 italic">event</span></>
              )}
            </h1>
            <p className="text-lg text-slate-500 font-medium leading-relaxed">
              {mode === 'login'
                ? 'Sign in to manage your profile, submit scores, and track your place on the leaderboard.'
                : 'Create an account to register your profile, submit scores, and appear on the world leaderboard.'}
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

        {/* Right: auth card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 md:p-10 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-6"
        >
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
            </h2>
            {mode === 'login' && (
              <p className="text-sm text-slate-500 font-medium">
                New here? Signing in with Google also creates your account.
              </p>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm">
              {error}
            </div>
          )}

          {resetMessage && (
            <div className="bg-emerald-50 border-2 border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-bold text-sm">
              {resetMessage}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white p-5 rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50"
          >
            <LogIn size={20} />
            CONTINUE WITH GOOGLE
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* LOGIN MODE */}
          {mode === 'login' && !showEmailLogin && (
            <button
              onClick={() => { resetError(); setShowEmailLogin(true); }}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 text-slate-700 p-5 rounded-2xl font-black text-lg hover:border-emerald-500 hover:text-emerald-700 transition-all"
            >
              <Mail size={20} />
              LOGIN WITH EMAIL
            </button>
          )}

          <AnimatePresence>
            {mode === 'login' && showEmailLogin && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleEmailLogin}
                className="space-y-4 overflow-hidden"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pl-11 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pl-11 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {isSubmitting ? 'LOGGING IN...' : 'LOG IN'}
                </button>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isSubmitting}
                  className="w-full text-sm font-bold text-emerald-600 hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* SIGNUP MODE */}
          {mode === 'signup' && (
            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleEmailSignup}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pl-11 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pl-11 font-bold text-slate-900 focus:border-emerald-500 outline-none transition-colors"
                    placeholder="At least 6 characters"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Golf club membership proof <span className="normal-case text-slate-300 font-semibold">(optional for now)</span>
                </label>
                <label className="flex items-center gap-3 w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 font-bold text-slate-500 cursor-pointer hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                  {membershipFile ? <FileCheck size={18} className="text-emerald-600 shrink-0" /> : <Upload size={18} className="shrink-0" />}
                  <span className="truncate text-sm">
                    {membershipFile ? membershipFile.name : 'Upload a photo or PDF of your membership'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setMembershipFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {isSubmitting ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
              </button>
            </motion.form>
          )}

          <p className="text-[11px] text-slate-400 font-medium text-center leading-relaxed">
            By continuing you agree to the event{' '}
            <Link to="/rules" className="text-emerald-600 font-bold hover:underline">rules</Link>{' '}
            and the free@last privacy policy.
          </p>

          <div className="pt-2 border-t border-slate-100 text-center space-y-2">
            {mode === 'login' ? (
              <p className="text-sm font-bold text-slate-500">
                Don't have an account?{' '}
                <button onClick={() => switchMode('signup')} className="text-emerald-600 hover:underline">
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-sm font-bold text-slate-500">
                Already have an account?{' '}
                <button onClick={() => switchMode('login')} className="text-emerald-600 hover:underline">
                  Log in
                </button>
              </p>
            )}
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