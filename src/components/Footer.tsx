import { Mail, Phone, MapPin, Trophy, Instagram, Facebook } from 'lucide-react';

// Placeholder contact details / staff list — replace with the real
// free@last / Putt for Poverty contacts before shipping.
const CONTACT = {
  email: 'events@freeatlast.org.uk',
  phone: '+44 121 000 0000',
  address: 'free@last, Nechells, Birmingham, UK',
};

const STAFF = [
  { name: 'J. Street', role: 'Event Organiser', email: 'jstreet@freeatlast.st' },
  { name: 'free@last Team', role: 'Charity Partner', email: 'events@freeatlast.org.uk' },
];

export function Footer() {
  return (
    <footer id="contact-footer" className="bg-slate-900 text-slate-300 pt-20 pb-10 mt-24">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pb-16 border-b border-slate-800">
          {/* About */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold">P</div>
              <span className="font-black text-white uppercase tracking-tighter">Putt for Poverty</span>
            </div>
            <p className="text-sm font-medium leading-relaxed text-slate-400">
              A charity golf tournament raising funds for free@last, supporting children and young people in
              Nechells, Birmingham.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="#" className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors">
                <Instagram size={16} />
              </a>
              <a href="#" className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors">
                <Facebook size={16} />
              </a>
            </div>
          </div>

          {/* Contact */}
          <div id="contact" className="space-y-4">
            <h3 className="font-black text-white uppercase tracking-widest text-sm">Contact</h3>
            <ul className="space-y-3 text-sm font-medium">
              <li className="flex items-center gap-3">
                <Mail size={16} className="text-emerald-500 shrink-0" />
                <a href={`mailto:${CONTACT.email}`} className="hover:text-white transition-colors">
                  {CONTACT.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={16} className="text-emerald-500 shrink-0" />
                <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} className="hover:text-white transition-colors">
                  {CONTACT.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>{CONTACT.address}</span>
              </li>
            </ul>
            <p className="text-xs text-slate-500 font-medium pt-2">
              Interested in sponsoring the event? Reach out — we'd love to have you on board.
            </p>
          </div>

          {/* Staff / organisers */}
          <div className="space-y-4">
            <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2">
              <Trophy size={16} className="text-emerald-500" />
              Organisers
            </h3>
            <ul className="space-y-3 text-sm font-medium">
              {STAFF.map((s) => (
                <li key={s.email}>
                  <div className="text-white font-bold">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.role}</div>
                  <a href={`mailto:${s.email}`} className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                    {s.email}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
          <span>© {new Date().getFullYear()} Putt for Poverty. Powered by free@last.</span>
          <span>100% of entry fees go directly to charity.</span>
        </div>
      </div>
    </footer>
  );
}