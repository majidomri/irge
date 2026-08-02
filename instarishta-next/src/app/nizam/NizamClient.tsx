'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import {
  PLANS, TOPUP, getPlan, LEGACY_PLAN_IDS,
  entitlementsFor, fmtAllowance, FREE_ENTITLEMENTS as FREE_ENT,
} from '@/lib/plans';
import { chipLabel } from '@/lib/interest-chips';

export interface Channel {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  cover_image:  string | null;
  created_at:   string;
}

interface Post {
  id:          string;
  channel_id:  string;
  title:       string | null;
  caption:     string | null;
  image:       string | null;
  audio_url:   string | null;
  created_at:  string;
}

interface Story {
  id:          string;
  channel_id:  string;
  image:       string;
  caption:     string | null;
  created_at:  string;
}

interface FeaturedItem {
  id:           string;
  title:        string;
  description:  string | null;
  image_url:    string | null;
  link_url:     string | null;
  placement:    string;
  active:       boolean;
  sort_order:   number;
  created_at:   string;
}

interface Interest {
  id: string;
  from_email: string;
  from_name: string | null;
  profile_id: number | null;
  profile_num: number | null;
  profile_title: string | null;
  profile_gender: string | null;
  chip: string | null;
  note: string | null;                 // legacy free-text rows, pre-007
  status: 'new' | 'seen' | 'forwarded' | 'rejected' | 'accepted' | 'declined' | 'connected';
  responded_at: string | null;
  revealed_at: string | null;
  created_at: string;
}

type Tab = 'channels' | 'posts' | 'stories' | 'featured' | 'users' | 'interests';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'channels', label: 'Channels', icon: '📺' },
  { key: 'posts',    label: 'Posts',    icon: '📝' },
  { key: 'stories',  label: 'Stories',  icon: '⭕' },
  { key: 'featured', label: 'Featured', icon: '⭐' },
  { key: 'interests', label: 'Interests', icon: '💚' },
  { key: 'users',    label: 'Users',    icon: '👤' },
];

interface Entitlements {
  planId: string;
  name: string;
  price: number;
  termMonths: number;
  contactPerCycle: number;
  welcomeCredits: number;
  refillsMonthly: boolean;
  interestsPerMonth: number;
  interestsPerDay: number;
  audioPerDay: number;
  profileViews: number;
  support: string;
  verifiedBadge: boolean;
  priorityListing: boolean;
}

interface InterestUsage { month: number; total: number; accepted: number; connected: number }

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  contact_credits: number;      // cycle balance — reset monthly
  bonus_credits: number | null; // purchased top-ups — persistent
  plan: string;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  monthly_credits: number | null;
  credits_reset_at: string | null;
  is_banned: boolean;
  created_at: string;
  entitlements: Entitlements;
  interests: InterestUsage;
}

const BG       = '#0a1a14';
const PANEL    = '#0f2419';
const BORDER   = 'rgba(255,255,255,0.08)';
const GREEN    = '#00A86B';
const GREEN_BG = 'rgba(0,168,107,0.12)';

export default function NizamClient({
  adminEmail, adminName, initialChannels,
}: {
  adminEmail: string;
  adminName?: string;
  initialChannels: Channel[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('channels');
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const logout = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: BG, color: '#fff' }}>

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-56 border-r shrink-0" style={{ borderColor: BORDER, background: PANEL }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: BORDER }}>
          <div className="text-[1.1rem] font-extrabold tracking-[-0.02em]">
            <span style={{ color: '#fff' }}>Insta</span><span style={{ color: GREEN }}>Rishta</span>
          </div>
          <p className="text-[0.65rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Nizam · Admin</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
              style={{
                background: tab === t.key ? GREEN_BG : 'transparent',
                color: tab === t.key ? GREEN : 'rgba(255,255,255,0.65)',
              }}>
              <span className="text-base w-5 text-center">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t pt-3" style={{ borderColor: BORDER }}>
          <p className="px-4 pb-2 text-[0.7rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {adminName ?? adminEmail}
          </p>
          <button onClick={logout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>🚪</span><span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile tab bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t"
        style={{ background: PANEL, borderColor: BORDER, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
            style={{ color: tab === t.key ? GREEN : 'rgba(255,255,255,0.4)' }}>
            <span className="text-[1.1rem] leading-none">{t.icon}</span>
            <span className="text-[0.55rem] font-semibold">{t.label}</span>
          </button>
        ))}
        <button onClick={logout}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
          style={{ color: 'rgba(255,255,255,0.3)' }}>
          <span className="text-[1.1rem] leading-none">🚪</span>
          <span className="text-[0.55rem] font-semibold">Out</span>
        </button>
      </nav>

      {/* ── Main panel ── */}
      <main className="flex-1 p-4 sm:p-8 max-w-5xl mx-auto pb-20 md:pb-8 w-full">
        {tab === 'channels' && (
          <ChannelsTab channels={channels} setChannels={setChannels} toast={showToast} />
        )}
        {tab === 'posts' && (
          <PostsTab channels={channels} toast={showToast} />
        )}
        {tab === 'stories' && (
          <StoriesTab channels={channels} toast={showToast} />
        )}
        {tab === 'featured' && (
          <FeaturedTab toast={showToast} />
        )}
        {tab === 'users' && (
          <UsersTab toast={showToast} />
        )}
        {tab === 'interests' && (
          <InterestsTab toast={showToast} />
        )}
      </main>

      {toast && (
        <div className="fixed left-1/2 bottom-24 md:bottom-8 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-sm font-semibold"
          style={{ background: '#141413', color: '#F3F0EE', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Tab: Channels ────────────────────────────────────────────────────────────

function ChannelsTab({
  channels, setChannels, toast,
}: {
  channels: Channel[]; setChannels: React.Dispatch<React.SetStateAction<Channel[]>>; toast: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage,  setCoverImage]  = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, description, cover_image: coverImage }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed to create');
      return;
    }
    const { channel } = await res.json();
    setChannels(prev => [channel, ...prev]);
    setName(''); setSlug(''); setDescription(''); setCoverImage('');
    toast('Channel created ✓');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this channel? Posts/stories inside it stay but become orphaned.')) return;
    const res = await fetch(`/api/admin/channels?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setChannels(prev => prev.filter(c => c.id !== id));
      toast('Deleted');
    } else {
      toast('Could not delete');
    }
  };

  return (
    <>
      <h1 className="text-[1.4rem] font-bold mb-6">Channels</h1>

      <form onSubmit={create} className="rounded-2xl p-5 mb-8 grid gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-bold mb-1">New channel</p>
        <Input value={name} setValue={setName} placeholder="Name (e.g. Bangalore Brides)" />
        <Input value={slug} setValue={setSlug} placeholder="URL slug (e.g. bangalore-brides)" />
        <Input value={description} setValue={setDescription} placeholder="Short description (optional)" />
        <Input value={coverImage} setValue={setCoverImage} placeholder="Cover image URL (optional)" />
        <SubmitBtn busy={busy} label="Create channel" />
      </form>

      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Existing ({channels.length})
      </p>
      <div className="flex flex-col gap-2">
        {channels.length === 0 && (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No channels yet.</p>
        )}
        {channels.map(c => (
          <div key={c.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            {c.cover_image && (
              <img src={c.cover_image} alt="" className="w-10 h-10 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>/{c.slug}</p>
            </div>
            <button onClick={() => remove(c.id)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(207,69,0,0.15)', color: '#FF8B5A' }}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Tab: Posts ───────────────────────────────────────────────────────────────

function PostsTab({ channels, toast }: { channels: Channel[]; toast: (m: string) => void }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/posts?channel_id=${channelId}`);
    setLoading(false);
    if (!res.ok) return;
    const { posts } = await res.json();
    setPosts(posts ?? []);
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, title, caption, image, audio_url: audioUrl }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed'); return;
    }
    const { post } = await res.json();
    setPosts(prev => [post, ...prev]);
    setTitle(''); setCaption(''); setImage(''); setAudioUrl('');
    toast('Post published ✓');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    const res = await fetch(`/api/admin/posts?id=${id}`, { method: 'DELETE' });
    if (res.ok) { setPosts(prev => prev.filter(p => p.id !== id)); toast('Deleted'); }
  };

  if (channels.length === 0) {
    return <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Create a channel first.</p>;
  }

  return (
    <>
      <h1 className="text-[1.4rem] font-bold mb-6">Posts</h1>

      <form onSubmit={create} className="rounded-2xl p-5 mb-8 grid gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-bold mb-1">New post</p>
        <Select value={channelId} setValue={setChannelId}
          options={channels.map(c => ({ value: c.id, label: c.name }))} />
        <Input value={title} setValue={setTitle} placeholder="Title (optional)" />
        <Textarea value={caption} setValue={setCaption} placeholder="Caption / body (optional)" />
        <Input value={image} setValue={setImage} placeholder="Image URL (optional)" />
        <Input value={audioUrl} setValue={setAudioUrl} placeholder="Audio URL (optional)" />
        <SubmitBtn busy={busy} label="Publish" />
      </form>

      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Recent ({posts.length})
      </p>
      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.length === 0 && (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No posts in this channel yet.</p>
          )}
          {posts.map(p => (
            <div key={p.id} className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
              {p.image && (
                <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {p.title && <p className="font-semibold text-sm">{p.title}</p>}
                {p.caption && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{p.caption.slice(0, 100)}</p>}
                {p.audio_url && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>🎙 Audio</p>}
              </div>
              <button onClick={() => remove(p.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                style={{ background: 'rgba(207,69,0,0.15)', color: '#FF8B5A' }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Tab: Stories ─────────────────────────────────────────────────────────────

function StoriesTab({ channels, toast }: { channels: Channel[]; toast: (m: string) => void }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [stories, setStories] = useState<Story[]>([]);
  const [image, setImage] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!channelId) return;
    const res = await fetch(`/api/admin/stories?channel_id=${channelId}`);
    if (res.ok) {
      const { stories } = await res.json();
      setStories(stories ?? []);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, image, caption }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed'); return;
    }
    const { story } = await res.json();
    setStories(prev => [story, ...prev]);
    setImage(''); setCaption('');
    toast('Story posted ✓');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this story?')) return;
    const res = await fetch(`/api/admin/stories?id=${id}`, { method: 'DELETE' });
    if (res.ok) { setStories(prev => prev.filter(s => s.id !== id)); toast('Deleted'); }
  };

  if (channels.length === 0) {
    return <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Create a channel first.</p>;
  }

  return (
    <>
      <h1 className="text-[1.4rem] font-bold mb-6">Stories</h1>

      <form onSubmit={create} className="rounded-2xl p-5 mb-8 grid gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-bold mb-1">New story</p>
        <Select value={channelId} setValue={setChannelId}
          options={channels.map(c => ({ value: c.id, label: c.name }))} />
        <Input value={image} setValue={setImage} placeholder="Image URL (required)" />
        <Input value={caption} setValue={setCaption} placeholder="Caption (optional)" />
        <SubmitBtn busy={busy} label="Post story" />
      </form>

      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Recent ({stories.length})
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {stories.map(s => (
          <div key={s.id} className="relative rounded-xl overflow-hidden aspect-[9/16]"
            style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            <img src={s.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <button onClick={() => remove(s.id)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Tab: Featured ────────────────────────────────────────────────────────────

function FeaturedTab({ toast }: { toast: (m: string) => void }) {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [placement, setPlacement] = useState('all');
  const [sortOrder, setSortOrder] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/featured');
    if (res.ok) {
      const { featured } = await res.json();
      setItems(featured ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/featured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description, image_url: imageUrl, link_url: linkUrl,
        placement, sort_order: sortOrder, active: true,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed'); return;
    }
    const { featured } = await res.json();
    setItems(prev => [...prev, featured].sort((a, b) => a.sort_order - b.sort_order));
    setTitle(''); setDescription(''); setImageUrl(''); setLinkUrl(''); setSortOrder(0);
    toast('Featured ✓');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this featured item?')) return;
    const res = await fetch(`/api/admin/featured?id=${id}`, { method: 'DELETE' });
    if (res.ok) { setItems(prev => prev.filter(i => i.id !== id)); toast('Deleted'); }
  };

  return (
    <>
      <h1 className="text-[1.4rem] font-bold mb-6">Featured Profiles</h1>

      <form onSubmit={create} className="rounded-2xl p-5 mb-8 grid gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-bold mb-1">New featured item</p>
        <Input value={title} setValue={setTitle} placeholder="Title (required)" />
        <Input value={description} setValue={setDescription} placeholder="Description (optional)" />
        <Input value={imageUrl} setValue={setImageUrl} placeholder="Image URL (optional)" />
        <Input value={linkUrl} setValue={setLinkUrl} placeholder="Link URL (e.g. /profiles/xyz)" />
        <Select value={placement} setValue={setPlacement} options={[
          { value: 'all',      label: 'All pages' },
          { value: 'home',     label: 'Home only' },
          { value: 'channels', label: 'Channels only' },
          { value: 'profiles', label: 'Profiles only' },
        ]} />
        <Input value={String(sortOrder)} setValue={v => setSortOrder(parseInt(v, 10) || 0)} placeholder="Sort order (number)" />
        <SubmitBtn busy={busy} label="Add featured" />
      </form>

      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Existing ({items.length})
      </p>
      <div className="flex flex-col gap-2">
        {items.map(it => (
          <div key={it.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            {it.image_url && (
              <img src={it.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{it.title}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {it.placement} · sort {it.sort_order} {it.active ? '· active' : '· inactive'}
              </p>
            </div>
            <button onClick={() => remove(it.id)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(207,69,0,0.15)', color: '#FF8B5A' }}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Small form primitives ────────────────────────────────────────────────────

function Input({ value, setValue, placeholder }: { value: string; setValue: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
  );
}

function Textarea({ value, setValue, placeholder }: { value: string; setValue: (v: string) => void; placeholder: string }) {
  return (
    <textarea value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} rows={4}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-y"
      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
  );
}

function Select({ value, setValue, options }: {
  value: string; setValue: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => setValue(e.target.value)}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }}>
      {options.map(o => <option key={o.value} value={o.value} style={{ background: BG }}>{o.label}</option>)}
    </select>
  );
}

function SubmitBtn({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" disabled={busy}
      className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
      style={{ background: GREEN, color: '#fff' }}>
      {busy ? 'Working…' : label}
    </button>
  );
}

// ── Users + credits manager ──────────────────────────────────────────────────
// ── Interests (moderation queue) ─────────────────────────────────────────────
// Interests are private signals to a family, never public comments — so this
// queue is the only place they are ever displayed. See migration 006.

const INTEREST_FILTERS: { key: string; label: string }[] = [
  { key: 'new',       label: 'New' },
  { key: 'forwarded', label: 'Told advertiser' },
  { key: 'accepted',  label: 'Wants to connect' },
  { key: 'connected', label: 'Connected' },
  { key: 'declined',  label: 'Declined' },
  { key: '',          label: 'All' },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  new:       { bg: 'rgba(0,168,107,0.15)',   fg: '#00C87A' },
  seen:      { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)' },
  forwarded: { bg: 'rgba(96,165,250,0.15)',  fg: '#60A5FA' },
  accepted:  { bg: 'rgba(0,168,107,0.22)',   fg: '#00C87A' },
  connected: { bg: 'rgba(240,192,64,0.15)',  fg: '#F0C040' },
  declined:  { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.45)' },
  rejected:  { bg: 'rgba(255,107,107,0.15)', fg: '#FF6B6B' },
};

/** What the admin can set next, in the order the workflow actually happens. */
const NEXT_ACTIONS: { key: 'forwarded' | 'accepted' | 'declined'; label: string }[] = [
  { key: 'forwarded', label: 'Told advertiser' },
  { key: 'accepted',  label: 'Wants to connect' },
  { key: 'declined',  label: 'Declined' },
];

function InterestsTab({ toast }: { toast: (m: string) => void }) {
  const [items, setItems]     = useState<Interest[]>([]);
  const [filter, setFilter]   = useState('new');
  const [loading, setLoading] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/interests${status ? `?status=${status}` : ''}`);
      const data = await res.json();
      setItems(data.interests ?? []);
      setNewCount(data.newCount ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => load(filter)); }, [load, filter]);

  const setStatus = async (id: string, status: Interest['status']) => {
    const res = await fetch('/api/admin/interests', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? 'Already connected');
      return;
    }
    if (res.ok) {
      // Drop it from the list when it no longer matches the active filter.
      setItems(list => (filter && status !== filter ? list.filter(i => i.id !== id)
                                                    : list.map(i => (i.id === id ? { ...i, status } : i))));
      if (status !== 'new') setNewCount(c => Math.max(0, c - 1));
      toast(`Marked ${status}`);
    } else {
      toast('Update failed');
    }
  };

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">
        Interests {newCount > 0 && <span style={{ color: GREEN }}>· {newCount} new</span>}
      </h1>
      <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Leads from members — private, never shown publicly. Tell the advertiser, then record their answer.
      </p>
      <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Only <strong style={{ color: '#00C87A' }}>Wants to connect</strong> lets the member spend a credit to
        see the number. Sending the interest was free, and a declined lead never costs them anything.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {INTEREST_FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="rounded-full px-4 py-1.5 text-xs font-bold"
            style={filter === f.key
              ? { background: GREEN, color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(i => {
            const s = STATUS_STYLE[i.status] ?? STATUS_STYLE.seen;
            return (
              <div key={i.id} className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      IR #{i.profile_num ?? '?'} · {i.profile_gender === 'female' ? 'Bride' : 'Groom'}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }} dir="auto">
                      {i.profile_title || '—'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold rounded-full px-2.5 py-1 shrink-0 uppercase"
                    style={{ background: s.bg, color: s.fg }}>
                    {i.status}
                  </span>
                </div>

                <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  From {i.from_name || i.from_email} · {i.from_email} · {fmtDate(i.created_at)}
                </p>

                <p className="text-[12px] rounded-xl px-3 py-2 mb-3"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)' }}>
                  {/* Pre-007 rows may still carry free text; newer ones are chips only. */}
                  {i.chip ? chipLabel(i.chip) : i.note ? `“${i.note}”` : '—'}
                </p>

                {i.status === 'connected' ? (
                  <p className="text-[11px]" style={{ color: '#F0C040' }}>
                    Member paid a credit and has the number{i.revealed_at ? ` · ${fmtDate(i.revealed_at)}` : ''}. Locked.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {NEXT_ACTIONS
                      .filter(a => a.key !== i.status)
                      .map(a => (
                        <button key={a.key} onClick={() => setStatus(i.id, a.key)}
                          className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
                          style={{ background: STATUS_STYLE[a.key].bg, color: STATUS_STYLE[a.key].fg }}>
                          {a.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** dd MMM yyyy, or '—'. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "in 9 days" / "today" / "overdue". */
function fmtIn(iso: string | null | undefined): string {
  if (!iso) return '—';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0)  return 'overdue';
  if (days === 0) return 'today';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function UsersTab({ toast }: { toast: (m: string) => void }) {
  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ]             = useState('');

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  const save = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers(us => us.map(u => (u.id === id ? { ...u, ...user } : u)));
      toast('Saved — user sees it live');
    } else {
      toast('Save failed');
    }
  }, [toast]);

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">Users &amp; subscriptions</h1>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Activate a term after verifying payment. Changes reflect on the user&apos;s account in real-time.
        Cycle credits refill monthly; top-ups are permanent.
      </p>

      <CatalogPanel />

      <form onSubmit={e => { e.preventDefault(); load(q); }} className="flex gap-2 mb-5">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by user ID, email, or name…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
        {q && (
          <button type="button" onClick={() => { setQ(''); load(''); }}
            className="rounded-xl px-4 py-2.5 text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            Clear
          </button>
        )}
        <button type="submit" className="rounded-xl px-5 py-2.5 text-sm font-bold" style={{ background: GREEN, color: '#fff' }}>
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>
      ) : users.length === 0 ? (
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <p>No users found.</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Email and name match on any part. A user ID must be the <strong>complete</strong> value —
            partial IDs can&apos;t be matched. Tap the ID under any user to copy it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map(u => <UserRow key={u.id} user={u} onSave={save} />)}
        </div>
      )}
    </div>
  );
}

/** One metered node: what they hold vs what the plan grants. */
function Node({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <p className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {label}
      </p>
      <p className="text-sm font-extrabold mt-0.5" style={{ color: accent ?? '#fff' }}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </div>
  );
}

/**
 * What each plan grants, straight from the shared catalog. Here so the team can
 * see the entitlement model without leaving the page — and so nothing in this
 * UI restates plan numbers that could drift from src/lib/plans.ts.
 */
function CatalogPanel() {
  const [open, setOpen] = useState(false);
  const rows = [FREE_ENT, ...PLANS.map(p => entitlementsFor(p.id))];

  return (
    <div className="rounded-2xl mb-5 overflow-hidden" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-white">What each plan grants</span>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th className="text-left px-4 py-2 font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>Entitlement</th>
                {rows.map(r => (
                  <th key={r.planId} className="px-3 py-2 text-center font-bold"
                    style={{ color: r.planId === 'none' ? 'rgba(255,255,255,0.5)' : GREEN }}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ color: 'rgba(255,255,255,0.7)' }}>
              {([
                ['Price',              (r: Entitlements) => r.price ? `₹${r.price.toLocaleString('en-IN')}` : 'Free'],
                ['Term',               (r: Entitlements) => r.termMonths ? `${r.termMonths} months` : '—'],
                ['Contact credits',    (r: Entitlements) => r.refillsMonthly ? `${r.contactPerCycle} / month` : `${r.welcomeCredits} once`],
                ['Refills monthly',    (r: Entitlements) => (r.refillsMonthly ? 'Yes' : 'No')],
                ['Interests',          (r: Entitlements) => `${r.interestsPerMonth} / 30d`],
                ['Interests per day',  (r: Entitlements) => `${r.interestsPerDay} (fair use)`],
                ['Audio plays',        (r: Entitlements) => fmtAllowance(r.audioPerDay, '/ day')],
                ['Profile views',      (r: Entitlements) => fmtAllowance(r.profileViews)],
                ['Support',            (r: Entitlements) => r.support],
                ['Verified badge*',    (r: Entitlements) => (r.verifiedBadge ? 'Yes' : '—')],
                ['Priority listing*',  (r: Entitlements) => (r.priorityListing ? 'Yes' : '—')],
              ] as [string, (r: Entitlements) => string][]).map(([label, fn]) => (
                <tr key={label} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td className="px-4 py-2">{label}</td>
                  {rows.map(r => (
                    <td key={r.planId} className="px-3 py-2 text-center font-semibold">{fn(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            * Not enforced anywhere in code — profiles come from the external feed, which has no badge or
            ranking field. These are promises the team keeps by hand.
          </p>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onSave }: { user: UserProfile; onSave: (id: string, patch: Record<string, unknown>) => Promise<void> }) {
  const [credits, setCredits] = useState(String(user.contact_credits));
  const [busy, setBusy]       = useState(false);
  const [copied, setCopied]   = useState(false);

  const dirty      = Number(credits) !== user.contact_credits;
  const activePlan = getPlan(user.plan);
  const isLegacy   = (LEGACY_PLAN_IDS as readonly string[]).includes(user.plan);
  // Server-computed so admin and the limiters read the same entitlement map.
  const ent        = user.entitlements ?? entitlementsFor(user.plan);

  const run = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try { await onSave(user.id, patch); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{user.full_name || user.email}</p>
          <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.email}</p>
          {/* Click to copy — this is the value the ID search expects. */}
          <button type="button" title="Copy user ID"
            onClick={() => {
              navigator.clipboard?.writeText(user.id).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }).catch(() => {});
            }}
            className="mt-1 text-[10px] font-mono rounded px-1.5 py-0.5 max-w-full truncate"
            style={{ background: 'rgba(255,255,255,0.05)', color: copied ? GREEN : 'rgba(255,255,255,0.3)' }}>
            {copied ? 'ID copied' : `ID ${user.id}`}
          </button>
        </div>
        <button
          onClick={() => run({ is_banned: !user.is_banned })}
          className="text-[11px] font-bold rounded-full px-3 py-1.5 shrink-0"
          style={user.is_banned
            ? { background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.3)' }
            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
          {user.is_banned ? 'Banned · Unban' : 'Ban'}
        </button>
      </div>

      {/* Plan header */}
      <div className="rounded-xl px-3 py-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <span className="font-bold" style={{ color: activePlan ? GREEN : 'rgba(255,255,255,0.5)' }}>
          {activePlan ? `${ent.name} · ₹${ent.price.toLocaleString('en-IN')} / ${ent.termMonths}mo`
            : isLegacy ? `${user.plan} (legacy)` : 'Free account'}
        </span>
        {activePlan && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>refills {fmtIn(user.credits_reset_at)}</span>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>expires {fmtDate(user.plan_expires_at)}</span>
          </>
        )}
        {isLegacy && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            expires {fmtDate(user.plan_expires_at)} · no refill, free-tier entitlements
          </span>
        )}
      </div>

      {/* Every metered node, granted vs used */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Node label="Contact credits"
          value={activePlan ? `${user.contact_credits}/${user.monthly_credits ?? 0}` : String(user.contact_credits)}
          sub={activePlan ? 'this cycle' : `welcome ${ent.welcomeCredits}, no refill`} />
        <Node label="Top-up credits" value={String(user.bonus_credits ?? 0)}
          sub="permanent" accent={(user.bonus_credits ?? 0) > 0 ? '#F0C040' : undefined} />
        <Node label="Interests"
          value={`${user.interests?.month ?? 0}/${ent.interestsPerMonth}`}
          sub={`30d · max ${ent.interestsPerDay}/day`} />
        <Node label="Audio plays"
          value={ent.audioPerDay < 0 ? 'Unlimited' : `${ent.audioPerDay}/day`}
          sub="profile views unlimited" />
      </div>

      {/* Leads + the entitlements nothing in code enforces */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[10px]"
        style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span>Leads: {user.interests?.total ?? 0} sent</span>
        <span style={{ color: '#00C87A' }}>{user.interests?.accepted ?? 0} awaiting reveal</span>
        <span style={{ color: '#F0C040' }}>{user.interests?.connected ?? 0} connected</span>
        <span>· Support: {ent.support}</span>
        {ent.verifiedBadge   && <span title="Not enforced in code — done by hand">Verified badge (manual)</span>}
        {ent.priorityListing && <span title="Not enforced in code — done by hand">Priority listing (manual)</span>}
      </div>

      {/* Sell a term. One call sets plan, anchor, allowance and cycle 0. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PLANS.map(p => (
          <button key={p.id} disabled={busy}
            onClick={() => run({ activate: p.id })}
            className="rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-40"
            style={{ background: GREEN_BG, color: GREEN, border: `1px solid ${GREEN}` }}>
            Activate {p.name} · ₹{p.price.toLocaleString('en-IN')}
          </button>
        ))}
        <button disabled={busy}
          onClick={() => run({ bonus_add: TOPUP.credits })}
          className="rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-40"
          style={{ background: 'rgba(240,192,64,0.12)', color: '#F0C040', border: '1px solid rgba(240,192,64,0.4)' }}>
          +{TOPUP.credits} top-up · ₹{TOPUP.price}
        </button>
      </div>

      {/* Support override — raw cycle balance. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <label className="text-[11px] sm:col-span-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Cycle credits (override — resets next refill)
          <input type="number" min={0} value={credits} onChange={e => setCredits(e.target.value)}
            className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
        </label>
        <button onClick={() => run({ contact_credits: Math.max(0, Math.floor(Number(credits) || 0)) })}
          disabled={busy || !dirty}
          className="rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
          style={{ background: GREEN, color: '#fff' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
