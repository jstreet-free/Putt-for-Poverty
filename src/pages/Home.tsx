import { motion } from 'motion/react';
import { Calendar, Heart, Award, ShieldCheck, Globe, Trophy, ArrowRight, Layout } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sponsor } from '../types';

export function Home({ participant }: { participant: any }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'sponsors'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setSponsors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sponsor)));
    });
    return () => unsub();
  }, []);

  return (
    <div className="space-y-24 pb-24">
      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center overflow-hidden rounded-3xl mx-4 bg-emerald-900 border-4 border-emerald-800 shadow-2xl">
        <div className="absolute inset-0 z-0 opacity-40">
          <img 
            src="https://www.pantherrungolfclub.com/images/golf_facts.jpg" 
            alt="Golf Course"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-900/40 to-transparent" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-8 text-white space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 px-4 py-2 rounded-full text-emerald-300 font-bold text-sm tracking-widest uppercase">
              <Calendar size={16} />
              September 2nd - 3rd, 2026
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
              PUTT FOR <br />
              <span className="text-emerald-400 italic">POVERTY</span>
            </h1>
            <p className="text-xl md:text-2xl text-emerald-100 max-w-2xl font-medium leading-relaxed">
              Join golfers worldwide for a 2-day tournament supporting <span className="text-white font-bold underline decoration-emerald-400">free@last</span> children's charity.
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-4"
          >
            <Link to="/register" className="bg-white text-emerald-900 px-8 py-4 rounded-full font-black text-lg hover:bg-emerald-50 transition-all flex items-center gap-2 shadow-xl hover:-translate-y-1">
              {participant ? 'VIEW PROFILE' : 'JOIN THE EVENT £20'}
              <ArrowRight size={20} />
            </Link>
            <Link to="/leaderboard" className="bg-emerald-950/40 backdrop-blur-md border border-emerald-400/30 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-emerald-800/40 transition-all">
              LEADERBOARD
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats / Info */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Trophy, title: 'Scoring System', desc: 'Internationally recognized scoring based on your handicap and course difficulty.' },
            { icon: Award, title: 'Top 3 Prizes', desc: 'Exclusive trophies and prizes for our top performers across the 48-hour window.' },
            { icon: ShieldCheck, title: 'Honesty Policy', desc: 'Open to registered club members with an official handicap. Integrity is our driver.' }
          ].map((item, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4"
            >
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <item.icon size={28} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800">{item.title}</h3>
              <p className="text-slate-600 leading-relaxed font-medium">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Charity Section */}
      <section className="bg-slate-900 py-24 text-white">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-1 bg-orange-500 rounded-full" />
              <span className="text-orange-500 font-black tracking-widest uppercase text-sm">Our Cause</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-black tracking-tight">Investing in the futures of <span className="text-orange-500 italic">Nechells'</span> children.</h2>
            <div className="space-y-6 text-xl text-slate-400 font-medium leading-relaxed">
              <p>
                <span className="text-white font-bold">free@last</span> is dedicated to improving the lives of children and young people in Nechells, Birmingham.
              </p>
              <p>
                From youth clubs and safe spaces to educational support and adventure trips, every penny of your £20 entry fee goes directly to providing hope and opportunity where it is needed most.
              </p>
            </div>
            <div className="flex gap-8 border-t border-slate-800 pt-8">
              <div>
                <div className="text-4xl font-black text-white">25+</div>
                <div className="text-sm text-slate-500 uppercase tracking-wider font-bold">Years of Impact</div>
              </div>
              <div>
                <div className="text-4xl font-black text-white">100%</div>
                <div className="text-sm text-slate-500 uppercase tracking-wider font-bold">Entry to Charity</div>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-orange-500/20 blur-3xl rounded-full" />
            <img 
              src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=2070&auto=format&fit=crop" 
              alt="Happy children"
              className="relative rounded-3xl shadow-2xl border-4 border-slate-800"
            />
            <div className="absolute bottom-8 -left-8 bg-white text-slate-900 p-6 rounded-2xl shadow-xl max-w-xs space-y-2">
              <div className="flex items-center gap-2 text-orange-500">
                <Heart size={20} fill="currentColor" />
                <span className="font-bold uppercase text-xs tracking-tighter">Impact Story</span>
              </div>
              <p className="font-bold text-lg">"The youth club gave me a safe place to go and changed my outlook on school."</p>
              <p className="text-sm text-slate-500 font-bold">— Marcus, 16</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsors */}
      <section className="max-w-7xl mx-auto px-4 text-center space-y-12">
        <div className="space-y-2">
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Our Generous Sponsors</h2>
          <p className="text-slate-500 font-medium">Supporting both the sport and the cause.</p>
        </div>
        
        {sponsors.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-12">
            {sponsors.map((s) => (
              <motion.div 
                key={s.id}
                className="group flex flex-col items-center gap-4 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer"
              >
                <div className="bg-slate-100 w-24 h-24 rounded-full flex items-center justify-center border-2 border-transparent group-hover:border-emerald-500 group-hover:bg-emerald-50 transition-all p-4 overflow-hidden">
                  <img src={s.logo} alt={s.name} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-black text-slate-700 tracking-tight">{s.name}</div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">{s.tagline}</div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="pt-8 opacity-40">
             <Layout size={48} className="mx-auto text-slate-300 mb-4" />
             <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Sponsors Announced Soon</p>
          </div>
        )}
        
        <div className="pt-8">
           <button className="text-emerald-600 font-bold hover:underline">Want to sponsor this event? Contact us.</button>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-emerald-600 mx-4 rounded-[3rem] p-12 md:p-24 text-center text-white space-y-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-700/30 rounded-full blur-3xl -ml-32 -mb-32" />
        
        <h2 className="text-4xl md:text-6xl font-black leading-tight max-w-3xl mx-auto">
          Ready to play for a purpose?
        </h2>
        <p className="text-xl text-emerald-50 max-w-xl mx-auto font-medium">
          Whether you are at your local club or travelling, your round matters. Register today.
        </p>
        <div className="pt-4 flex flex-col items-center gap-4">
          <Link to="/register" className="bg-white text-emerald-900 px-12 py-5 rounded-xl font-black text-xl hover:bg-emerald-50 transition-all shadow-lg hover:shadow-xl inline-flex items-center gap-2">
            {participant ? 'GO TO PROFILE' : 'START REGISTRATION'}
            <ArrowRight size={24} />
          </Link>
          <p className="text-sm font-bold text-emerald-200">Payment secured by Stripe</p>
        </div>
      </section>
    </div>
  );
}
