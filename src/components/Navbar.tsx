import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { LogIn, LogOut, Menu, X, Trophy, Map, ScrollText, UserCircle, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function Navbar({ user, participant }: { user: any, participant: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const navItems = [
    { name: 'Leaderboard', path: '/leaderboard', icon: Trophy },
    { name: 'Player Map', path: '/map', icon: Map },
    { name: 'The Rules', path: '/rules', icon: ScrollText },
  ];

  const isAdmin = participant?.role === 'admin' || user?.email === 'jstreet@freeatlast.st';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            P
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="font-extrabold text-lg text-emerald-800 uppercase tracking-tighter">Putt for Poverty</span>
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-widest leading-none">Powered by free@last</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 text-sm font-semibold transition-colors",
                location.pathname === item.path ? "text-emerald-600" : "text-slate-600 hover:text-emerald-500"
              )}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          ))}
          
          {isAdmin && (
            <Link 
              to="/admin" 
              className={cn(
                "flex items-center gap-2 text-sm font-semibold transition-colors",
                location.pathname === '/admin' ? "text-blue-600" : "text-blue-500 hover:text-blue-600"
              )}
            >
              <Settings size={18} />
              Admin
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-4">
              <Link to="/register" className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-bold border border-emerald-100 hover:bg-emerald-100 transition-colors">
                <UserCircle size={18} />
                Profile
              </Link>
              <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-rose-500 transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="bg-emerald-600 text-white px-5 py-2 rounded-full font-bold text-sm hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              <LogIn size={18} />
              Join the Event
            </button>
          )}
        </div>

        {/* Mobile Toggle */}
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden text-slate-600">
          {isOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-0 right-0 bg-white border-b border-slate-200 p-4 flex flex-col gap-4 shadow-lg md:hidden"
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 text-lg font-bold text-slate-700 p-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <item.icon size={20} />
                </div>
                {item.name}
              </Link>
            ))}
            <hr className="border-slate-100" />
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 text-blue-600 p-2 rounded-xl hover:bg-blue-50 transition-colors font-bold"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Settings size={20} />
                </div>
                Admin Dashboard
              </Link>
            )}
            {user ? (
              <div className="space-y-3">
                <Link
                  to="/register"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 bg-emerald-600 text-white p-3 rounded-xl font-bold justify-center"
                >
                  <UserCircle size={20} />
                  My Profile
                </Link>
                <button
                  onClick={() => { signOut(auth); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 bg-slate-100 text-slate-600 p-3 rounded-xl font-bold justify-center"
                >
                  <LogOut size={20} />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => { handleLogin(); setIsOpen(false); }}
                className="flex items-center gap-3 bg-emerald-600 text-white p-3 rounded-xl font-bold justify-center"
              >
                <LogIn size={20} />
                Sign In with Google
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
