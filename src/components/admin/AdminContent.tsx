import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { Megaphone, Plus, Trash2, Pin, Mail, Send, UserPlus } from 'lucide-react';
import { Announcement, Newsletter, NewsletterSubscriber } from '../../types';

type SubTab = 'announcements' | 'newsletter';

export function AdminContent() {
  const [subTab, setSubTab] = useState<SubTab>('announcements');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TabButton active={subTab === 'announcements'} onClick={() => setSubTab('announcements')} label="Announcements" />
        <TabButton active={subTab === 'newsletter'} onClick={() => setSubTab('newsletter')} label="Newsletter" />
      </div>
      {subTab === 'announcements' ? <AnnouncementsPanel /> : <NewsletterPanel />}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function AnnouncementsPanel() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', content: '', imageUrl: '', linkUrl: '', linkText: 'Learn More' });

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'announcements');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        ...form,
        createdAt: new Date().toISOString(),
        pinned: false,
      });
      setForm({ title: '', content: '', imageUrl: '', linkUrl: '', linkText: 'Learn More' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'announcements');
    }
  };

  const handleTogglePin = async (a: Announcement) => {
    try {
      await updateDoc(doc(db, 'announcements', a.id), { pinned: !a.pinned });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `announcements/${a.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <form onSubmit={handleCreate} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm space-y-4 lg:col-span-1 h-fit">
        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
          <Plus size={18} /> New Announcement
        </h3>
        <Input label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
        <Textarea label="Content" value={form.content} onChange={(v) => setForm({ ...form, content: v })} required />
        <Input label="Image URL (optional)" value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} />
        <Input label="Link URL (optional)" value={form.linkUrl} onChange={(v) => setForm({ ...form, linkUrl: v })} />
        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-colors">
          Publish
        </button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        {loading ? (
          <div className="text-slate-400 font-bold p-8 text-center">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-slate-400 font-bold p-8 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
            No announcements yet.
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin size={14} className="text-orange-500 shrink-0" />}
                  <div className="font-black text-slate-900">{a.title}</div>
                </div>
                <p className="text-sm text-slate-500 font-medium mt-1 line-clamp-2">{a.content}</p>
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
                  {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleTogglePin(a)} className="text-slate-400 hover:text-orange-500 p-2">
                  <Pin size={16} />
                </button>
                <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-rose-500 p-2">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NewsletterPanel() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', imageUrl: '', linkUrl: '', linkText: 'Learn More' });
  const [newSub, setNewSub] = useState({ name: '', email: '' });

  useEffect(() => {
    const unsubSubs = onSnapshot(
      collection(db, 'newsletter_subscribers'),
      (snap) => setSubscribers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NewsletterSubscriber))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'newsletter_subscribers')
    );
    const unsubNl = onSnapshot(
      query(collection(db, 'newsletters'), orderBy('sentAt', 'desc')),
      (snap) => {
        setNewsletters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Newsletter)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'newsletters');
        setLoading(false);
      }
    );
    return () => {
      unsubSubs();
      unsubNl();
    };
  }, []);

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSub.name || !newSub.email) return;
    try {
      await addDoc(collection(db, 'newsletter_subscribers'), {
        ...newSub,
        subscribedAt: new Date().toISOString(),
      });
      setNewSub({ name: '', email: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'newsletter_subscribers');
    }
  };

  const handleRemoveSubscriber = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'newsletter_subscribers', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `newsletter_subscribers/${id}`);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim() || sending) return;
    setSending(true);
    try {
      // NOTE: this records the newsletter for history/display purposes.
      // Actually emailing subscribers requires a server-side mail step
      // (e.g. a Cloud Function trigger on this collection) which is not
      // wired up yet — see the setup notes.
      await addDoc(collection(db, 'newsletters'), {
        ...form,
        sentAt: new Date().toISOString(),
        recipientCount: subscribers.length,
      });
      setForm({ title: '', content: '', imageUrl: '', linkUrl: '', linkText: 'Learn More' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'newsletters');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={handleSend} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm space-y-4">
          <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
            <Mail size={18} /> Compose Newsletter
          </h3>
          <Input label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
          <Textarea label="Content" value={form.content} onChange={(v) => setForm({ ...form, content: v })} required />
          <Input label="Image URL (optional)" value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} />
          <Input label="Link URL (optional)" value={form.linkUrl} onChange={(v) => setForm({ ...form, linkUrl: v })} />
          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Send size={16} />
            {sending ? 'Recording...' : `Record & Queue for ${subscribers.length} subscribers`}
          </button>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
            This logs the newsletter and its recipient count. Actual email delivery needs a Cloud Function
            trigger on the <code>newsletters</code> collection wired to an email provider (SendGrid, Resend, etc).
          </p>
        </form>

        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Send History</h4>
          {loading ? (
            <div className="text-slate-400 font-bold p-6 text-center">Loading...</div>
          ) : newsletters.length === 0 ? (
            <div className="text-slate-400 font-bold p-6 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200 text-sm">
              No newsletters sent yet.
            </div>
          ) : (
            newsletters.map((n) => (
              <div key={n.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="font-bold text-slate-900">{n.title}</div>
                <div className="text-xs text-slate-400 font-bold">
                  {new Date(n.sentAt).toLocaleString()} · {n.recipientCount || 0} recipients
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm">Subscribers ({subscribers.length})</h3>
        </div>
        <form onSubmit={handleAddSubscriber} className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm space-y-2">
          <Input label="Name" value={newSub.name} onChange={(v) => setNewSub({ ...newSub, name: v })} required compact />
          <Input label="Email" value={newSub.email} onChange={(v) => setNewSub({ ...newSub, email: v })} required compact />
          <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-2.5 rounded-xl font-black uppercase text-xs hover:bg-emerald-700 transition-colors">
            <UserPlus size={14} /> Add Subscriber
          </button>
        </form>
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {subscribers.map((s) => (
            <div key={s.id} className="p-3 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-bold text-slate-800 truncate">{s.name}</div>
                <div className="text-xs text-slate-400 truncate">{s.email}</div>
              </div>
              <button onClick={() => handleRemoveSubscriber(s.id)} className="text-slate-300 hover:text-rose-500 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors ${
          compact ? 'p-2.5 text-sm' : 'p-3'
        }`}
      />
    </div>
  );
}

function Textarea({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <textarea
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-blue-500 outline-none transition-colors resize-none"
      />
    </div>
  );
}

// Icon used only in this file's tab bar rendering context
export const AdminContentIcon = Megaphone;
