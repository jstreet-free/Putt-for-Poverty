import { motion } from 'motion/react';
import { ScrollText, ShieldCheck, Flag, Info, AlertTriangle, Scale } from 'lucide-react';

export function Rules() {
  const stabilityPoints = [
    { score: 'Eagle (2 under net par)', points: 4 },
    { score: 'Birdie (1 under net par)', points: 3 },
    { score: 'Par (Net par)', points: 2 },
    { score: 'Bogey (1 over net par)', points: 1 },
    { score: 'Double Bogey+ (2+ over net par)', points: 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">THE <span className="text-emerald-600">RULES</span></h1>
        <p className="text-slate-500 font-medium text-lg">Foundation of integrity, competition, and charity.</p>
      </div>

      {/* Honesty Policy */}
      <section className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden divide-y divide-slate-100">
        <div className="p-8 md:p-12 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800">Honesty & Integrity Policy</h2>
              <p className="text-emerald-600 font-bold uppercase tracking-widest text-xs">A Covenant for Golfers</p>
            </div>
          </div>
          
          <div className="space-y-6 text-slate-600 font-medium leading-relaxed text-lg">
            <p>
              At its core, golf is a game of honor. Because this event involves variable courses and self-reporting, we rely on the <span className="text-slate-900 font-bold">Putt for Poverty Covenant</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {[
                { icon: Scale, title: 'Official Handicaps', desc: 'All participants must have an active handicap with a recognized golf club.' },
                { icon: Flag, title: 'Course Validation', desc: 'Rounds must be played at a regulation course you are registered for.' },
                { icon: AlertTriangle, title: 'Peer Review', desc: 'Random spot-checks of scorecards may be requested to verify top-tier scores.' },
                { icon: Info, title: 'Finality', desc: 'The tournament committee reserves the right to adjust scores based on handicap data.' }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <item.icon className="text-emerald-500 shrink-0" size={24} />
                  <div className="space-y-1">
                    <div className="font-black text-slate-800 uppercase tracking-tighter text-sm">{item.title}</div>
                    <p className="text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="bg-slate-50 p-6 rounded-2xl border-l-4 border-emerald-500 italic text-slate-500">
              "By registering and paying the £20 fee, I solemnly swear to uphold the rules of golf and the integrity of this charity event. I recognize that a trophy won by deceit is no trophy at all."
            </p>
          </div>
        </div>

        {/* Scoring Section */}
        <div className="p-8 md:p-12 space-y-8 bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
              <Scale size={36} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800">Event Scoring</h2>
              <p className="text-blue-600 font-bold uppercase tracking-widest text-xs">How to calculate your points</p>
            </div>
          </div>

          <div className="space-y-6 text-slate-600 font-medium leading-relaxed">
            <p>
              The scoring system allows players of all skill levels to compete fairly. Points are awarded based on your performance on each hole relative to your <span className="font-bold text-slate-900">Net Par</span>.
            </p>
            
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200">
              {stabilityPoints.map((p, i) => (
                <div key={i} className="px-6 py-4 flex justify-between items-center border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <span className="font-bold text-slate-700">{p.score}</span>
                  <span className="bg-blue-100 text-blue-700 font-black px-4 py-1 rounded-full">{p.points} PTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Prize / Charity Tie-in */}
      <div className="bg-orange-500 rounded-3xl p-12 text-white relative overflow-hidden text-center md:text-left">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
          <div className="space-y-4 flex-1">
             <h3 className="text-4xl font-black">Winning for Nechells</h3>
             <p className="text-xl font-medium text-orange-50 italic opacity-90">
               Remember: even if you hit a double bogey, you're still hitting a hole-in-one for the children of Nechells. Every point is a promise to a child.
             </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white text-orange-600 w-24 h-24 rounded-full flex items-center justify-center shadow-xl">
              <Trophy size={48} />
            </div>
            <div className="text-sm font-black uppercase tracking-widest">The Charity Trophy</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Trophy = ({ size, className }: any) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);
