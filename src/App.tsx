import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, DocumentData } from 'firebase/firestore';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { Register } from './pages/Register';
import { Leaderboard } from './pages/Leaderboard';
import { MapPage } from './pages/MapPage';
import { Rules } from './pages/Rules';
import { ScoreUpload } from './pages/ScoreUpload';
import { Admin } from './pages/Admin';
import { motion, AnimatePresence } from 'motion/react';
import { Login } from './pages/Login';

import { APIProvider } from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY || (process as any).env?.GOOGLE_MAPS_PLATFORM_KEY || '';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [participant, setParticipant] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubPart: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (unsubPart) unsubPart();
      setUser(u);
      if (u) {
        const partRef = doc(db, 'participants', u.uid);
        unsubPart = onSnapshot(partRef, (doc) => {
          setParticipant(doc.exists() ? doc.data() : null);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `participants/${u.uid}`);
          setLoading(false);
        });
      } else {
        setParticipant(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribeAuth();
      if (unsubPart) unsubPart();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-emerald-50">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const content = (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Navbar user={user} participant={participant} />
      <main className="pt-16 pb-20 px-4 md:px-0">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Home participant={participant} />} />
            <Route path="/leaderboard" element={<Leaderboard user={user} />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/rules" element={<Rules />} />
            <Route 
              path="/register" 
              element={user ? <Register user={user} participant={participant} /> : <Navigate to="/login" state={{ from: '/register' }} />} 
            />
            <Route path="/login" element={<Login user={user} />} />
            <Route 
              path="/admin" 
              element={(user && (participant?.role === 'admin' || user.email === 'jstreet@freeatlast.st')) ? <Admin user={user} participant={participant} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/upload" 
              element={user && (participant?.paidRounds > participant?.usedRounds) ? <ScoreUpload user={user} participant={participant} /> : <Navigate to="/register" />} 
            />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );

  return (
    <BrowserRouter>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly" libraries={['places', 'geocoding']}>
        {content}
      </APIProvider>
    </BrowserRouter>
  );
}
