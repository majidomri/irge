'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  supabase, getChannels, getPosts, getStories, createChannel,
  deletePost, deleteStory, signIn, signOut, getSession,
  type IChannel, type IPost, type IStory,
} from '@/lib/supabase';

// ── Cloudinary ──────────────────────────────────────────────────────────────
const CLOUD_NAME    = 'dkt6odvzv';
const UPLOAD_PRESET = 'ml_default';

async function uploadToCloud(file: File, folder: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'instarishta/' + folder);
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Upload failed');
  return json.secure_url as string;
}

// ── Types ───────────────────────────────────────────────────────────────────
type MainTab = 'overview' | 'users' | 'channels' | 'posts' | 'stories' | 'setup';
type ContentTab = 'channels' | 'posts' | 'stories';

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
  none:     { label: 'No Plan',  color: '#696969', bg: '#f0f0f0' },
  silver:   { label: 'Silver',   color: '#7B8FA1', bg: '#e8edf2' },
  gold:     { label: 'Gold',     color: '#C8960C', bg: '#fdf3ce' },
  diamond:  { label: 'Diamond',  color: '#2563EB', bg: '#dbeafe' },
  platinum: { label: 'Platinum', color: '#006241', bg: '#d1fae5' },
};

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  plan: string;
  contact_credits: number;
  plan_expires_at: string | null;
  is_banned: boolean;
  full_name: string | null;
  notes: string | null;
}

const SETUP_SQL = `-- Run this in your Supabase SQL Editor to enable User Management

CREATE TABLE IF NOT EXISTS public.ir_user_profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  full_name        TEXT,
  plan             TEXT DEFAULT 'none'
                   CHECK (plan IN ('none','silver','gold','diamond','platinum')),
  contact_credits  INT  DEFAULT 0,
  plan_expires_at  TIMESTAMPTZ,
  is_banned        BOOLEAN DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ir_user_profiles ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; deny all other access (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_profiles' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_user_profiles USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- Optional: also set ADMIN_EMAILS in your Vercel env vars
-- ADMIN_EMAILS=your@email.com,other@email.com`;

// ── NavItem ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, badge, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left text-sm font-medium transition-all"
      style={{
        background: active ? 'rgba(0,168,107,0.12)' : 'transparent',
        color: active ? '#00A86B' : 'rgba(255,255,255,0.65)',
      }}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#00A86B', color: '#fff' }}>{badge}</span>
      )}
    </button>
  );
}

// ── EditUserModal ────────────────────────────────────────────────────────────
function EditUserModal({ user, token, onClose, onSaved }: {
  user: UserRow; token: string; onClose: () => void; onSaved: (u: Partial<UserRow>) => void;
}) {
  const [plan,    setPlan]    = useState(user.plan);
  const [credits, setCredits] = useState(user.contact_credits);
  const [expires, setExpires] = useState(user.plan_expires_at ? user.plan_expires_at.slice(0, 10) : '');
  const [name,    setName]    = useState(user.full_name ?? '');
  const [notes,   setNotes]   = useState(user.notes ?? '');
  const [banned,  setBanned]  = useState(user.is_banned);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const body = {
      plan,
      contact_credits: credits,
      plan_expires_at: expires ? new Date(expires).toISOString() : null,
      full_name: name || null,
      notes: notes || null,
      is_banned: banned,
    };
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? 'Error'); setSaving(false); return; }
    onSaved(body);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={{ background: '#1a2820' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-sm">{user.email}</h3>
            <p className="text-[0.72rem] text-[rgba(255,255,255,0.45)]">Edit membership & access</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>✕</button>
        </div>

        <div>
          <label className="text-[0.72rem] font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider block mb-1.5">Full Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>

        <div>
          <label className="text-[0.72rem] font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider block mb-1.5">Plan</label>
          <div className="grid grid-cols-5 gap-1.5">
            {Object.entries(PLAN_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setPlan(key)}
                className="py-2 rounded-xl text-[0.7rem] font-bold transition-all"
                style={{
                  background: plan === key ? meta.color : 'rgba(255,255,255,0.06)',
                  color: plan === key ? '#fff' : 'rgba(255,255,255,0.5)',
                  border: plan === key ? `1.5px solid ${meta.color}` : '1.5px solid transparent',
                }}
              >{meta.label}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[0.72rem] font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider block mb-1.5">Contact Credits</label>
            <input type="number" min={0} value={credits} onChange={e => setCredits(+e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <label className="text-[0.72rem] font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider block mb-1.5">Plan Expires</label>
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }} />
          </div>
        </div>

        <div>
          <label className="text-[0.72rem] font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider block mb-1.5">Notes (internal)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{ background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={banned}
            onClick={() => setBanned(b => !b)}
            className="w-10 h-5 rounded-full transition-colors relative"
            style={{ background: banned ? '#CF4500' : 'rgba(255,255,255,0.15)' }}
          >
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: banned ? '1.25rem' : '0.125rem' }} />
          </button>
          <span className="text-sm font-medium" style={{ color: banned ? '#FF6B3D' : 'rgba(255,255,255,0.65)' }}>
            {banned ? 'Banned — account suspended' : 'Active — account in good standing'}
          </span>
        </label>

        {err && <p className="text-[0.78rem] font-medium" style={{ color: '#FF6B3D' }}>{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#00A86B', color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function NizamPage() {
  const [session,  setSession]  = useState<boolean | null>(null);
  const [token,    setToken]    = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [tab,      setTab]      = useState<MainTab>('overview');
  const [toast,    setToast]    = useState('');
  const [uploading,setUploading]= useState(false);

  // Content management
  const [channels,  setChannels]  = useState<IChannel[]>([]);
  const [active,    setActive]    = useState<IChannel | null>(null);
  const [posts,     setPosts]     = useState<IPost[]>([]);
  const [stories,   setStories]   = useState<IStory[]>([]);
  const [contentTab,setContentTab]= useState<ContentTab>('posts');

  const [newChName, setNewChName] = useState('');
  const [newChDesc, setNewChDesc] = useState('');
  const [npTitle,   setNpTitle]   = useState('');
  const [npCaption, setNpCaption] = useState('');
  const [npImage,   setNpImage]   = useState('');
  const [npAudio,   setNpAudio]   = useState('');
  const [npThumb,   setNpThumb]   = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const storyRef = useRef<HTMLInputElement>(null);

  // Users
  const [users,       setUsers]       = useState<UserRow[]>([]);
  const [usersLoading,setUsersLoading]= useState(false);
  const [userSearch,  setUserSearch]  = useState('');
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    getSession().then(s => {
      setSession(!!s);
      setToken(s?.access_token ?? '');
    });
    supabase.auth.onAuthStateChange((_, s) => {
      setSession(!!s);
      setToken(s?.access_token ?? '');
    });
  }, []);

  useEffect(() => { if (session) getChannels().then(setChannels).catch(console.error); }, [session]);
  useEffect(() => {
    if (!active) return;
    getPosts(active.id, 0).then(setPosts).catch(console.error);
    getStories(active.id).then(setStories).catch(console.error);
  }, [active]);

  const doLogin  = async () => { setLoginErr(''); try { await signIn(email, password); } catch (e: unknown) { setLoginErr((e as Error).message); } };
  const doLogout = async () => { await signOut(); setSession(false); setChannels([]); setActive(null); setUsers([]); setToken(''); };

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    try {
      const res  = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setUsers(json.users as UserRow[]);
    } catch (e: unknown) { showToast('Users error: ' + (e as Error).message); }
    finally { setUsersLoading(false); }
  }, [token]);

  useEffect(() => { if (tab === 'users' && token) loadUsers(); }, [tab, token, loadUsers]);

  const handleUserSaved = (id: string, patch: Partial<UserRow>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
    showToast('User updated ✓');
  };

  const deleteUser = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) { setUsers(prev => prev.filter(u => u.id !== id)); showToast('User deleted'); }
    else showToast('Delete failed');
    setDeletingId(null);
  };

  const quickBan = async (u: UserRow) => {
    const is_banned = !u.is_banned;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ is_banned }),
    });
    if (res.ok) { handleUserSaved(u.id, { is_banned }); }
    else showToast('Error updating ban');
  };

  // Channels / Posts / Stories
  const addChannel = async () => {
    if (!newChName.trim()) return;
    try {
      const ch = await createChannel(newChName.trim(), newChDesc.trim());
      setChannels(prev => [ch, ...prev]); setNewChName(''); setNewChDesc('');
      showToast('Channel created ✓');
    } catch (e: unknown) { showToast('Error: ' + (e as Error).message); }
  };

  const uploadPostImg = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !active) return;
    setUploading(true);
    try {
      const url = await uploadToCloud(file, 'posts');
      setNpImage(url); setNpThumb(url.replace('/upload/', '/upload/w_420,q_auto,f_auto/'));
      showToast('Image ready ✓');
    } catch (e: unknown) { showToast('Upload failed: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const submitPost = async () => {
    if (!active || !npImage) { showToast('Select a channel and upload an image.'); return; }
    const { data, error } = await supabase.from('ir_posts').insert([{
      channel_id: active.id, image: npImage, thumb: npThumb || null,
      title: npTitle || null, caption: npCaption || null, audio_url: npAudio || null,
    }]).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setPosts(prev => [data, ...prev]);
    setNpTitle(''); setNpCaption(''); setNpImage(''); setNpThumb(''); setNpAudio('');
    showToast('Post published ✓');
  };

  const removePost = async (id: string) => {
    await deletePost(id);
    setPosts(prev => prev.filter(p => p.id !== id));
    showToast('Post deleted');
  };

  const uploadStory = async () => {
    if (!active) { showToast('Select a channel first'); return; }
    const file = storyRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloud(file, 'stories');
      const { data, error } = await supabase.from('ir_stories').insert([{ channel_id: active.id, image: url }]).select().single();
      if (error) throw error;
      setStories(prev => [data, ...prev]);
      showToast('Story added ✓');
    } catch (e: unknown) { showToast('Error: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const removeStory = async (id: string) => {
    await deleteStory(id);
    setStories(prev => prev.filter(s => s.id !== id));
    showToast('Story deleted');
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (session === null) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0e1a14' }}>
      <div className="spinner" />
    </div>
  );

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!session) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg, #0e1a14 0%, #1a2e22 100%)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ background: '#1a2820', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div className="mb-8">
          <div className="text-[1.5rem] font-extrabold tracking-[-0.02em] mb-1">
            <span style={{ color: '#fff' }}>Insta</span><span style={{ color: '#00A86B' }}>Rishta</span>
          </div>
          <p className="text-[0.78rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>Control Panel · Restricted Access</p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            className="rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" onKeyDown={e => e.key === 'Enter' && doLogin()}
            className="rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          {loginErr && <p className="text-xs font-medium" style={{ color: '#FF6B3D' }}>{loginErr}</p>}
          <button
            onClick={doLogin}
            className="w-full py-3 rounded-xl font-bold text-sm mt-1"
            style={{ background: '#00A86B', color: '#fff' }}
          >Sign In</button>
        </div>
      </div>
    </div>
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const planCounts = users.reduce((acc, u) => {
    acc[u.plan] = (acc[u.plan] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalActive  = users.filter(u => !u.is_banned && u.plan !== 'none').length;
  const totalBanned  = users.filter(u => u.is_banned).length;
  const recentUsers  = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  const NAV: { id: MainTab; icon: string; label: string; badge?: number }[] = [
    { id: 'overview',  icon: '📊', label: 'Overview' },
    { id: 'users',     icon: '👥', label: 'Users', badge: users.length },
    { id: 'channels',  icon: '📡', label: 'Channels', badge: channels.length },
    { id: 'posts',     icon: '🖼️', label: 'Posts' },
    { id: 'stories',   icon: '✨', label: 'Stories' },
    { id: 'setup',     icon: '⚙️', label: 'Setup' },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#0e1a14', fontFamily: 'Inter, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold" style={{ background: '#141413', color: '#F3F0EE', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          token={token}
          onClose={() => setEditingUser(null)}
          onSaved={patch => { handleUserSaved(editingUser.id, patch); setEditingUser(null); }}
        />
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rounded-2xl p-6 w-80" style={{ background: '#1a2820' }}>
            <p className="font-bold text-white mb-2">Delete this user?</p>
            <p className="text-[0.82rem] text-[rgba(255,255,255,0.5)] mb-5">This permanently removes the account and all associated data.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
              <button onClick={() => deleteUser(deletingId)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#CF4500', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r" style={{ background: '#121e18', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="text-[1.1rem] font-extrabold tracking-[-0.02em]">
            <span style={{ color: '#fff' }}>Insta</span><span style={{ color: '#00A86B' }}>Rishta</span>
          </div>
          <p className="text-[0.65rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Nizam Control Panel</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV.map(n => (
            <NavItem
              key={n.id}
              icon={n.icon}
              label={n.label}
              active={tab === n.id}
              badge={n.badge}
              onClick={() => setTab(n.id)}
            />
          ))}
        </nav>

        <div className="px-3 pb-4 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <span>🚪</span><span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="p-8 max-w-4xl">
            <h1 className="text-[1.4rem] font-bold text-white mb-1">Overview</h1>
            <p className="text-[0.82rem] mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>Platform snapshot</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Users',    value: users.length,  icon: '👥', color: '#00A86B' },
                { label: 'Active Plans',   value: totalActive,   icon: '✅', color: '#C8960C' },
                { label: 'Banned',         value: totalBanned,   icon: '🚫', color: '#CF4500' },
                { label: 'Channels',       value: channels.length, icon: '📡', color: '#2563EB' },
              ].map(s => (
                <div key={s.label} className="rounded-2xl p-5" style={{ background: '#1a2820' }}>
                  <div className="text-2xl mb-3">{s.icon}</div>
                  <div className="text-[1.8rem] font-extrabold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[0.75rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Plan breakdown */}
              <div className="rounded-2xl p-5" style={{ background: '#1a2820' }}>
                <h3 className="text-sm font-bold text-white mb-4">Plan Distribution</h3>
                {Object.entries(PLAN_META).map(([key, meta]) => {
                  const count = planCounts[key] ?? 0;
                  const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                  return (
                    <div key={key} className="mb-3">
                      <div className="flex justify-between text-[0.75rem] mb-1">
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{count} users</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent signups */}
              <div className="rounded-2xl p-5" style={{ background: '#1a2820' }}>
                <h3 className="text-sm font-bold text-white mb-4">Recent Signups</h3>
                {recentUsers.length === 0 && <p className="text-[0.8rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>No users yet — load Users tab first</p>}
                {recentUsers.map(u => {
                  const meta = PLAN_META[u.plan] ?? PLAN_META.none;
                  return (
                    <div key={u.id} className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: meta.color, color: '#fff' }}>
                        {u.email[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.78rem] font-medium text-white truncate">{u.email}</p>
                        <p className="text-[0.7rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h1 className="text-[1.4rem] font-bold text-white mb-1">Users</h1>
                <p className="text-[0.82rem]" style={{ color: 'rgba(255,255,255,0.45)' }}>{users.length} total accounts</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search email or name…"
                  className="rounded-xl px-4 py-2.5 text-sm outline-none w-56"
                  style={{ background: '#1a2820', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
                <button
                  onClick={loadUsers}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
                >↻ Refresh</button>
              </div>
            </div>

            {usersLoading ? (
              <div className="flex items-center justify-center py-24"><div className="spinner" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-4xl mb-3">👥</p>
                <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>No users found</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Make sure the ir_user_profiles table exists (see Setup tab)</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#1a2820' }}>
                {/* Table header */}
                <div className="grid text-[0.7rem] font-bold uppercase tracking-wider px-5 py-3" style={{ gridTemplateColumns: '1fr 1fr 100px 80px 110px 80px 100px', color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <span>Email</span>
                  <span>Name</span>
                  <span>Plan</span>
                  <span>Credits</span>
                  <span>Expires</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>

                {filteredUsers.map((u, i) => {
                  const meta = PLAN_META[u.plan] ?? PLAN_META.none;
                  return (
                    <div
                      key={u.id}
                      className="grid items-center px-5 py-3 text-sm"
                      style={{
                        gridTemplateColumns: '1fr 1fr 100px 80px 110px 80px 100px',
                        borderBottom: i < filteredUsers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        opacity: u.is_banned ? 0.55 : 1,
                      }}
                    >
                      <span className="text-white text-[0.78rem] truncate pr-2">{u.email}</span>
                      <span className="text-[0.75rem] truncate pr-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{u.full_name ?? '—'}</span>
                      <span>
                        <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                      </span>
                      <span className="text-[0.78rem] font-semibold" style={{ color: '#00A86B' }}>{u.contact_credits}</span>
                      <span className="text-[0.72rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString('en-IN') : '—'}
                      </span>
                      <span>
                        {u.is_banned
                          ? <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(207,69,0,0.15)', color: '#FF6B3D' }}>Banned</span>
                          : <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B' }}>Active</span>
                        }
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="text-[0.68rem] font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
                        >Edit</button>
                        <button
                          onClick={() => quickBan(u)}
                          className="text-[0.68rem] font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: u.is_banned ? 'rgba(0,168,107,0.1)' : 'rgba(207,69,0,0.1)', color: u.is_banned ? '#00A86B' : '#FF6B3D' }}
                        >{u.is_banned ? 'Unban' : 'Ban'}</button>
                        <button
                          onClick={() => setDeletingId(u.id)}
                          className="text-[0.68rem] font-semibold px-2 py-1 rounded-lg"
                          style={{ background: 'rgba(207,69,0,0.08)', color: '#CF4500' }}
                        >✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CHANNELS / POSTS / STORIES ───────────────────────────────── */}
        {(tab === 'channels' || tab === 'posts' || tab === 'stories') && (
          <div className="p-8 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 items-start">
            {/* Channel sidebar */}
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Channels</p>
              <div className="rounded-xl p-4 mb-4" style={{ background: '#1a2820' }}>
                <p className="text-[0.7rem] font-bold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>New Channel</p>
                <input value={newChName} onChange={e => setNewChName(e.target.value)} placeholder="Name" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <input value={newChDesc} onChange={e => setNewChDesc(e.target.value)} placeholder="Description" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <button onClick={addChannel} className="w-full py-2 rounded-lg text-sm font-bold" style={{ background: '#00A86B', color: '#fff' }}>Create</button>
              </div>
              <div className="flex flex-col gap-1">
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => { setActive(ch); setTab('posts'); setContentTab('posts'); }}
                    className="text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background:  active?.id === ch.id ? 'rgba(0,168,107,0.15)' : 'transparent',
                      color:       active?.id === ch.id ? '#00A86B' : 'rgba(255,255,255,0.6)',
                      border:      active?.id === ch.id ? '1px solid rgba(0,168,107,0.3)' : '1px solid transparent',
                    }}
                  >{ch.name}</button>
                ))}
              </div>
            </div>

            {/* Content panel */}
            <div>
              {!active ? (
                <div className="text-center py-24" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  <p className="text-4xl mb-4">📡</p>
                  <p className="font-medium text-white">Select or create a channel</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <h2 className="text-[1.1rem] font-bold text-white">{active.name}</h2>
                    <div className="flex rounded-full overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                      {(['posts', 'stories', 'channels'] as ContentTab[]).map(t => (
                        <button key={t} onClick={() => setContentTab(t)} className="px-4 py-2 text-xs font-bold capitalize transition-colors"
                          style={{ background: contentTab === t ? '#00A86B' : 'transparent', color: contentTab === t ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {contentTab === 'channels' && (
                    <div className="rounded-2xl p-6" style={{ background: '#1a2820' }}>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {[['Name', active.name], ['Slug', '/channels/' + active.slug], ['Posts', posts.length], ['Stories', stories.length]].map(([k, v]) => (
                          <div key={k as string}><span className="font-semibold text-white">{k}: </span><span style={{ color: 'rgba(255,255,255,0.5)' }}>{String(v)}</span></div>
                        ))}
                        <div className="col-span-2"><span className="font-semibold text-white">Description: </span><span style={{ color: 'rgba(255,255,255,0.5)' }}>{active.description ?? '—'}</span></div>
                      </div>
                    </div>
                  )}

                  {contentTab === 'posts' && (
                    <>
                      <div className="rounded-2xl p-5 mb-5" style={{ background: '#1a2820' }}>
                        <p className="text-[0.7rem] font-bold uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>New Post</p>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <input value={npTitle}   onChange={e => setNpTitle(e.target.value)}   placeholder="Title (optional)" className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                          <input value={npAudio}   onChange={e => setNpAudio(e.target.value)}   placeholder="Audio URL"        className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                        </div>
                        <textarea value={npCaption} onChange={e => setNpCaption(e.target.value)} placeholder="Caption" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                        <div className="flex items-center gap-3 flex-wrap">
                          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPostImg} />
                          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                            {uploading ? 'Uploading…' : npImage ? '✓ Change Image' : 'Upload Image'}
                          </button>
                          {npImage && <img src={npImage} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                          <button onClick={submitPost} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: '#00A86B', color: '#fff' }}>Publish</button>
                        </div>
                      </div>
                      <p className="text-[0.7rem] font-bold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>All Posts ({posts.length})</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {posts.map(p => (
                          <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden group" style={{ background: '#1a2820' }}>
                            <img src={p.thumb ?? p.image} alt={p.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
                            {p.title && <span className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-semibold text-white truncate" style={{ background: 'rgba(0,0,0,0.6)' }}>{p.title}</span>}
                            <button onClick={() => removePost(p.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: '#CF4500', color: '#fff' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {contentTab === 'stories' && (
                    <>
                      <div className="rounded-2xl p-5 mb-5 flex items-center justify-between" style={{ background: '#1a2820' }}>
                        <p className="text-sm font-semibold text-white">Active Stories ({stories.length})</p>
                        <div>
                          <input ref={storyRef} type="file" accept="image/*" className="hidden" onChange={uploadStory} />
                          <button onClick={() => storyRef.current?.click()} disabled={uploading} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: '#00A86B', color: '#fff' }}>
                            {uploading ? 'Uploading…' : '+ Add Story'}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {stories.map(s => (
                          <div key={s.id} className="relative aspect-[9/16] rounded-xl overflow-hidden group" style={{ background: '#1a2820' }}>
                            <img src={s.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white" style={{ background: 'rgba(0,0,0,0.5)' }}>
                              {new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <button onClick={() => removeStory(s.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: '#CF4500', color: '#fff' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── SETUP ───────────────────────────────────────────────────── */}
        {tab === 'setup' && (
          <div className="p-8 max-w-2xl">
            <h1 className="text-[1.4rem] font-bold text-white mb-1">Setup</h1>
            <p className="text-[0.82rem] mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>One-time configuration steps</p>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">1. Create User Profiles Table</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Run this SQL in your Supabase Dashboard → SQL Editor</p>
              <pre className="rounded-xl p-4 text-[0.72rem] leading-relaxed overflow-x-auto" style={{ background: '#0e1a14', color: '#7dd3b0' }}>{SETUP_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(SETUP_SQL); showToast('SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">2. Set Environment Variables</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Add these in Vercel → Project → Settings → Environment Variables</p>
              <div className="space-y-2.5">
                {[
                  ['SUPABASE_SERVICE_ROLE_KEY', 'Your Supabase service_role secret key'],
                  ['ADMIN_EMAILS', 'Comma-separated admin emails e.g. you@email.com'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-3" style={{ background: '#0e1a14' }}>
                    <p className="text-[0.72rem] font-mono font-bold" style={{ color: '#7dd3b0' }}>{k}</p>
                    <p className="text-[0.7rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">3. Security Notes</h3>
              <ul className="space-y-2 text-[0.8rem]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <li>• This panel URL (<code className="text-[#7dd3b0]">/nizam</code>) is secret — do not share it publicly</li>
                <li>• The old <code className="text-[#7dd3b0]">/admin</code> URL is permanently redirected to homepage</li>
                <li>• All User API endpoints require a valid Supabase session token</li>
                <li>• Set <code className="text-[#7dd3b0]">ADMIN_EMAILS</code> to restrict API access to specific accounts</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
