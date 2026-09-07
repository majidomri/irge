'use client';

import dynamic from 'next/dynamic';

const AnalyticsTab = dynamic(
  () => import('./AnalyticsTab').then((m) => m.AnalyticsTab),
  { ssr: false },
);
import BiodataTab from './BiodataTab';
import ImportTab from './ImportTab';
import SecurityTab from './SecurityTab';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import {
  PLANS, TOPUP, getPlan, LEGACY_PLAN_IDS,
  entitlementsFor, fmtAllowance, FREE_ENTITLEMENTS as FREE_ENT,
} from '@/lib/plans';
import { chipLabel } from '@/lib/interest-chips';
import {
  professionIcon, professionLabel, DOC_TYPES, DOC_LABELS,
  type Profession, type DocType,
} from '@/lib/professions';
import { useProfessions, invalidateProfessions } from '@/lib/hooks/useProfessions';

export interface Channel {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  cover_image:  string | null;
  created_at:   string;
  /**
   * ir_channels holds two different things: real channels (is_cohort false)
   * and profession cohorts (is_cohort true, rendered at /cohorts). The public
   * channel list filters on this — see getChannels() in lib/supabase.ts — so a
   * post written to a cohort renders on no channel page at all. Admin tabs
   * that publish content must not offer cohorts as a destination.
   */
  is_cohort:    boolean;
}

interface Post {
  id:          string;
  channel_id:  string;
  user_id:     string | null;
  owner_email: string | null;
  title:       string | null;
  caption:     string | null;
  image:       string | null;
  audio_url:   string | null;
  created_at:  string;
  /** Admin-only triage flag from the importer — never rendered publicly. */
  needs_redaction?: boolean;
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

type Tab = 'channels' | 'posts' | 'import' | 'stories' | 'featured' | 'users' | 'interests' | 'reports' | 'comments' | 'verification' | 'professions' | 'biodata' | 'security' | 'analytics';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'analytics', label: 'Analytics', icon: '📈' },
  { key: 'channels', label: 'Channels', icon: '📺' },
  { key: 'posts',    label: 'Posts',    icon: '📝' },
  { key: 'import',   label: 'Import',   icon: '📥' },
  { key: 'stories',  label: 'Stories',  icon: '⭕' },
  { key: 'featured', label: 'Featured', icon: '⭐' },
  { key: 'interests', label: 'Interests', icon: '💚' },
  { key: 'comments', label: 'Comments', icon: '💬' },
  { key: 'verification', label: 'Verify', icon: '✅' },
  { key: 'professions', label: 'Professions', icon: '🎓' },
  { key: 'biodata', label: 'Biodata', icon: '📋' },
  { key: 'reports',  label: 'Reports',  icon: '🚩' },
  { key: 'users',    label: 'Users',    icon: '👤' },
  { key: 'security', label: 'Security', icon: '🛡️' },
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

interface Report {
  id: string;
  reporter_user_id: string | null;
  reporter_email: string | null;
  reporter_contact: string | null;
  entity_type: 'profile' | 'member' | 'post' | 'story' | 'channel' | 'other';
  entity_id: string | null;
  profile_num: number | null;
  category: string;
  description: string | null;
  severity: 'normal' | 'urgent';
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  ip_address: string | null;
  created_at: string;
}

interface ChannelComment {
  id: string;
  entity_type: 'post' | 'story';
  entity_id: string;
  user_id: string;
  author_name: string;
  chip_key: string;
  hidden: boolean;
  created_at: string;
}

/** A profile resolved from an IR # against the live feed. */
interface IrProfile {
  num: number;
  id: number | null;
  title: string;
  body: string;
  gender: string;
  age: number | null;
  education: string | null;
  priority: string | null;
  phone: string | null;
}

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

  /**
   * Stable identity, and that is load-bearing rather than tidiness.
   *
   * Every tab takes this as `toast` and now uses it inside the useCallback
   * that loads its data, so it belongs in those dependency arrays. As a plain
   * arrow function it was a new value on every render of this component —
   * which meant a failed load would toast, re-render the parent, give the tab
   * a fresh `load`, refire its effect, fail again, and toast again. A refetch
   * loop, on exactly the endpoint that was already broken.
   */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const logout = async () => {
    await signOut();
    router.push('/');
  };

  /*
   * Force /profiles to re-read jsdata.json from GitHub.
   *
   * The profile ads deliberately stay in the repo behind the Cloudflare
   * relay, so an edit normally takes up to ~35 minutes to appear (GitHub's
   * CDN, then the worker's 5-minute KV cache, then Next's 30-minute tag).
   * This collapses that to one click. The secret lives server-side in
   * /api/admin/profiles/refresh — nothing sensitive is in this component.
   */
  const [refreshing, setRefreshing] = useState(false);

  const refreshProfiles = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res  = await fetch('/api/admin/profiles/refresh', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error ?? 'Refresh failed'); return; }
      showToast(
        typeof data.count === 'number'
          ? `Profiles refreshed — ${data.count} live`
          : 'Profiles refreshed',
      );
    } catch {
      showToast('Refresh failed');
    } finally {
      setRefreshing(false);
    }
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
          <button onClick={refreshProfiles} disabled={refreshing}
            title="Re-read jsdata.json from GitHub now, skipping every cache"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 mb-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: GREEN_BG, color: GREEN, border: 'none' }}>
            <span>{refreshing ? '⏳' : '🔄'}</span>
            <span>{refreshing ? 'Refreshing…' : 'Refresh profiles'}</span>
          </button>
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
        <button onClick={refreshProfiles} disabled={refreshing}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 disabled:opacity-50"
          style={{ color: refreshing ? GREEN : 'rgba(255,255,255,0.4)' }}>
          <span className="text-[1.1rem] leading-none">{refreshing ? '⏳' : '🔄'}</span>
          <span className="text-[0.55rem] font-semibold">Refresh</span>
        </button>
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
        {tab === 'import' && (
          <ImportTab channels={channels} toast={showToast} />
        )}
        {tab === 'stories' && (
          <StoriesTab channels={channels} toast={showToast} />
        )}
        {tab === 'biodata' && (
          <BiodataTab toast={showToast} />
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
        {tab === 'reports' && (
          <ReportsTab toast={showToast} />
        )}
        {tab === 'security' && (
          <SecurityTab toast={showToast} />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab toast={showToast} />
        )}
        {tab === 'comments' && (
          <CommentsTab toast={showToast} />
        )}
        {tab === 'verification' && (
          <VerificationTab toast={showToast} />
        )}
        {tab === 'professions' && (
          <ProfessionsTab toast={showToast} />
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

  // Inline edit state — one row at a time, seeded from the row being opened.
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [editName,        setEditName]        = useState('');
  const [editSlug,        setEditSlug]        = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoverImage,  setEditCoverImage]  = useState('');

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

  const saveEdit = async (id: string) => {
    setBusy(true);
    const res = await fetch('/api/admin/channels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name:        editName,
        slug:        editSlug,
        description: editDescription,
        cover_image: editCoverImage,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed to update');
      return;
    }
    const { channel } = await res.json();
    setChannels(prev => prev.map(c => (c.id === id ? channel : c)));
    setEditingId(null);
    toast('Channel updated ✓');
  };

  const startEdit = (c: Channel) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug);
    setEditDescription(c.description ?? '');
    setEditCoverImage(c.cover_image ?? '');
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
        {channels.map(c => editingId === c.id ? (
          <div key={c.id} className="rounded-xl p-4 grid gap-3"
            style={{ background: PANEL, border: `1px solid ${GREEN}` }}>
            <p className="text-sm font-bold">Edit channel</p>
            <Input value={editName} setValue={setEditName} placeholder="Name" />
            <Input value={editSlug} setValue={setEditSlug} placeholder="URL slug" />
            <Input value={editDescription} setValue={setEditDescription} placeholder="Short description (optional)" />
            <Input value={editCoverImage} setValue={setEditCoverImage} placeholder="Cover image URL (optional)" />
            {editSlug !== c.slug && (
              <p className="text-[11px]" style={{ color: '#FF8B5A' }}>
                Changing the slug changes this channel&apos;s URL. Existing links to
                /channels/{c.slug} will 404.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => saveEdit(c.id)} disabled={busy}
                className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: GREEN, color: '#04150d' }}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingId(null)}
                className="text-xs font-semibold px-4 py-2 rounded-lg"
                style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#fff' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={c.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            {c.cover_image && (
              <img src={c.cover_image} alt="" className="w-10 h-10 rounded-lg object-cover" loading="lazy" decoding="async" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">
                {c.name}
                {c.is_cohort && (
                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
                    COHORT
                  </span>
                )}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>/{c.slug}</p>
            </div>
            <button onClick={() => startEdit(c)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: GREEN_BG, color: GREEN }}>
              Edit
            </button>
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
  const [ownerEmail, setOwnerEmail] = useState('');
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
      body: JSON.stringify({ channel_id: channelId, title, caption, image, audio_url: audioUrl, owner_email: ownerEmail }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      toast(error ?? 'Failed'); return;
    }
    const { post } = await res.json();
    setPosts(prev => [post, ...prev]);
    setTitle(''); setCaption(''); setImage(''); setAudioUrl(''); setOwnerEmail('');
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
        <Input value={ownerEmail} setValue={setOwnerEmail} placeholder="Owner's email (optional)" />
        <p className="text-[11px] -mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Attributes the post to a member so they get notified when someone comments. Leave blank for house content.
        </p>
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
                <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" decoding="async" />
              )}
              <div className="flex-1 min-w-0">
                {p.needs_redaction && (
                  <p className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mb-1"
                    style={{ background: 'rgba(245,165,36,0.18)', color: '#f5a524' }}>
                    NEEDS REDACTION
                  </p>
                )}
                {p.title && <p className="font-semibold text-sm">{p.title}</p>}
                {p.caption && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{p.caption.slice(0, 100)}</p>}
                {p.audio_url && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>🎙 Audio</p>}
                <p className="text-[10px] mt-1" style={{ color: p.owner_email ? GREEN : 'rgba(255,255,255,0.3)' }}>
                  {p.owner_email ? `👤 ${p.owner_email}` : '🏠 House content — no owner'}
                </p>
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
            <img src={s.image} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
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
              <img src={it.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" loading="lazy" decoding="async" />
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
  const [q, setQ]             = useState('');
  // Read inside the filter effect without making the search term a dependency,
  // which would re-fetch on every keystroke.
  const qRef = useRef('');

  const load = useCallback(async (status: string, query = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (query)  params.set('q', query);
      const res  = await fetch(`/api/admin/interests${params.toString() ? `?${params}` : ''}`);
      const data = await res.json();
      setItems(data.interests ?? []);
      setNewCount(data.newCount ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => load(filter, qRef.current)); }, [load, filter]);

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

      <form onSubmit={e => { e.preventDefault(); qRef.current = q; load(filter, q); }} className="flex gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search IR #12, member email, or name…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
        {q && (
          <button type="button" onClick={() => { setQ(''); qRef.current = ''; load(filter, ''); }}
            className="rounded-xl px-4 py-2.5 text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            Clear
          </button>
        )}
        <button type="submit" className="rounded-xl px-5 py-2.5 text-sm font-bold" style={{ background: GREEN, color: '#fff' }}>
          Search
        </button>
      </form>

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

const REPORT_FILTERS = [
  { key: 'open',      label: 'Open' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'actioned',  label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: '',          label: 'All' },
];

const REPORT_CATEGORY_LABEL: Record<string, string> = {
  fake_profile: 'Fake profile', underage: 'Suspected minor', harassment: 'Harassment',
  scam_fraud: 'Scam / fraud', inappropriate_content: 'Inappropriate content',
  impersonation: 'Impersonation', spam: 'Spam', other: 'Other',
};

const REPORT_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open:      { bg: 'rgba(234,67,53,0.15)',  fg: '#EA4335' },
  reviewing: { bg: 'rgba(240,192,64,0.15)', fg: '#F0C040' },
  actioned:  { bg: GREEN_BG,                fg: GREEN     },
  dismissed: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.5)' },
};

/**
 * Misuse/abuse queue backing /child-safety's "reviewed within 2 hours"
 * promise. entity_id for 'member' reports is a /p/ slug — click through to
 * see what was flagged before acting, since the underlying account is
 * deliberately not exposed here (see /api/admin/reports).
 */
function ReportsTab({ toast }: { toast: (m: string) => void }) {
  const [items, setItems]         = useState<Report[]>([]);
  const [filter, setFilter]       = useState('open');
  const [loading, setLoading]     = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [q, setQ]                 = useState('');
  const qRef = useRef('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = useCallback(async (status: string, query = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (query)  params.set('q', query);
      const res  = await fetch(`/api/admin/reports${params.toString() ? `?${params}` : ''}`);
      // Without this a 500 parsed to {} and the tab showed "no reports" —
      // indistinguishable from a clean queue, which is the worst way for a
      // moderation surface to fail.
      if (!res.ok) { toast('Could not load reports'); return; }
      const data = await res.json();
      setItems(data.reports ?? []);
      setOpenCount(data.openCount ?? 0);
      setUrgentCount(data.urgentOpenCount ?? 0);
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { queueMicrotask(() => load(filter, qRef.current)); }, [load, filter]);

  const setStatus = async (id: string, status: Report['status']) => {
    const res = await fetch('/api/admin/reports', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setItems(list => (filter && status !== filter ? list.filter(r => r.id !== id)
                                                     : list.map(r => (r.id === id ? { ...r, status } : r))));
      if (filter === 'open' || filter === '') setOpenCount(c => Math.max(0, c - 1));
      toast(`Marked ${status}`);
    } else {
      toast('Update failed');
    }
  };

  const saveNotes = async (id: string) => {
    const admin_notes = notesDraft[id] ?? '';
    const res = await fetch('/api/admin/reports', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, admin_notes }),
    });
    toast(res.ok ? 'Notes saved' : 'Save failed');
  };

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">
        Reports
        {openCount > 0   && <span style={{ color: '#EA4335' }}> · {openCount} open</span>}
        {urgentCount > 0 && <span style={{ color: '#EA4335' }}> · {urgentCount} urgent</span>}
      </h1>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Misuse and abuse reports from members and visitors. Urgent categories (suspected minors) also
        page the team on Telegram/email the moment they&apos;re submitted — see /child-safety.
      </p>

      <form onSubmit={e => { e.preventDefault(); qRef.current = q; load(filter, q); }} className="flex gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search IR #, reporter email, or details…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
        {q && (
          <button type="button" onClick={() => { setQ(''); qRef.current = ''; load(filter, ''); }}
            className="rounded-xl px-4 py-2.5 text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            Clear
          </button>
        )}
        <button type="submit" className="rounded-xl px-5 py-2.5 text-sm font-bold" style={{ background: GREEN, color: '#fff' }}>
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-5">
        {REPORT_FILTERS.map(f => (
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
          {items.map(r => {
            const s = REPORT_STATUS_STYLE[r.status] ?? REPORT_STATUS_STYLE.open;
            return (
              <div key={r.id} className="rounded-2xl p-4"
                style={{ background: PANEL, border: r.severity === 'urgent' ? '1px solid #EA4335' : `1px solid ${BORDER}` }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {REPORT_CATEGORY_LABEL[r.category] ?? r.category}
                      {r.severity === 'urgent' && (
                        <span className="ml-2 text-[10px] font-bold uppercase rounded-full px-2 py-0.5"
                          style={{ background: '#EA4335', color: '#fff' }}>Urgent</span>
                      )}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {r.entity_type}{r.profile_num ? ` · IR #${r.profile_num}` : ''}
                      {r.entity_id && r.entity_type === 'member' ? (
                        <> · <a href={`/p/${r.entity_id}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: GREEN }}>/p/{r.entity_id}</a></>
                      ) : r.entity_id ? ` · ${r.entity_id}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold rounded-full px-2.5 py-1 shrink-0 uppercase"
                    style={{ background: s.bg, color: s.fg }}>
                    {r.status}
                  </span>
                </div>

                <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  From {r.reporter_email || r.reporter_contact || 'anonymous'} · {fmtDate(r.created_at)}
                  {r.ip_address ? ` · ${r.ip_address}` : ''}
                </p>

                {r.description && (
                  <p className="text-[12px] rounded-xl px-3 py-2 mb-3" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)' }}>
                    {r.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {(['reviewing', 'actioned', 'dismissed'] as const)
                    .filter(k => k !== r.status)
                    .map(k => (
                      <button key={k} onClick={() => setStatus(r.id, k)}
                        className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
                        style={{ background: REPORT_STATUS_STYLE[k].bg, color: REPORT_STATUS_STYLE[k].fg }}>
                        Mark {k}
                      </button>
                    ))}
                </div>

                <div className="flex gap-2">
                  <input value={notesDraft[r.id] ?? r.admin_notes ?? ''}
                    onChange={e => setNotesDraft(d => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="Internal notes…"
                    className="flex-1 rounded-xl px-3 py-1.5 text-[11px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: `1px solid ${BORDER}` }} />
                  <button onClick={() => saveNotes(r.id)} className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const COMMENT_CHIP_LABEL: Record<string, string> = {
  interested: '🙋 I am interested', view_profile: '👀 Look at my Profile',
  is_done: '❓ Is this Rishta Done?', answer_asap: '⏰ Please Answer ASAP',
};

/**
 * Moderation feed for public channel comments (see migration
 * 010_channel_comments.sql). Unlike interests/reports, these are visible to
 * every visitor, so "Hide" is the one action that matters here — it's a soft
 * delete, the row survives for audit.
 */
function CommentsTab({ toast }: { toast: (m: string) => void }) {
  const [items, setItems]     = useState<ChannelComment[]>([]);
  const [filter, setFilter]   = useState<'visible' | 'hidden'>('visible');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f: 'visible' | 'hidden') => {
    setLoading(true);
    try {
      const params = f === 'hidden' ? '?hidden=1' : '';
      const res  = await fetch(`/api/admin/comments${params}`);
      const data = await res.json();
      const all  = (data.comments ?? []) as ChannelComment[];
      setItems(f === 'hidden' ? all : all.filter(c => !c.hidden));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => load(filter)); }, [load, filter]);

  const setHidden = async (id: string, hidden: boolean) => {
    const res = await fetch('/api/admin/comments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hidden }),
    });
    if (res.ok) {
      setItems(list => list.filter(c => c.id !== id));
      toast(hidden ? 'Comment hidden' : 'Comment restored');
    } else {
      toast('Update failed');
    }
  };

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">Comments</h1>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Public comments on channel posts. Hiding is a soft delete — the row is kept, just no longer shown.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['visible', 'hidden'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="rounded-full px-4 py-1.5 text-xs font-bold capitalize"
            style={filter === f
              ? { background: GREEN, color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(c => (
            <div key={c.id} className="rounded-2xl p-4 flex items-center justify-between gap-3"
              style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {c.author_name} <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>· {COMMENT_CHIP_LABEL[c.chip_key] ?? c.chip_key}</span>
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.entity_type} {c.entity_id} · {fmtDate(c.created_at)}
                </p>
              </div>
              <button onClick={() => setHidden(c.id, !c.hidden)}
                className="rounded-xl px-3 py-1.5 text-[11px] font-bold shrink-0"
                style={c.hidden
                  ? { background: GREEN_BG, color: GREEN }
                  : { background: 'rgba(234,67,53,0.15)', color: '#EA4335' }}>
                {c.hidden ? 'Restore' : 'Hide'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab({ toast }: { toast: (m: string) => void }) {
  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ]             = useState('');
  // Set when an IR # search matched a profile nobody has shown interest in —
  // so we can say that, rather than the misleading "no users found".
  const [noLeadsForIr, setNoLeadsForIr] = useState<number | null>(null);
  // The actual profile behind an IR #, resolved from the same live feed
  // /profiles reads, so the admin sees who the number refers to.
  const [irProfile, setIrProfile] = useState<IrProfile | null>(null);

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      if (!res.ok) { toast('Could not load users'); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
      setNoLeadsForIr(typeof data.noLeadsForIr === 'number' ? data.noLeadsForIr : null);
      setIrProfile(data.irProfile ?? null);
    } finally { setLoading(false); }
  }, [toast]);

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
          placeholder="Search IR #12, email, name, or account ID…"
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

      {/* The profile an IR # refers to — same feed and numbering as /profiles. */}
      {irProfile && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: PANEL, border: `1px solid ${GREEN}` }}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold" style={{ color: GREEN }}>
                IR #{irProfile.num} · {irProfile.gender === 'female' ? 'Bride' : 'Groom'}
                {irProfile.priority && (
                  <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>
                    {irProfile.priority}
                  </span>
                )}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {[irProfile.age ? `${irProfile.age} yrs` : null, irProfile.education,
                  irProfile.id != null ? `feed id ${irProfile.id}` : null]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <a href={`https://www.instarishta.me/profiles?id=${irProfile.num}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-bold rounded-full px-3 py-1.5 shrink-0 no-underline"
              style={{ background: GREEN_BG, color: GREEN }}>
              View on site ↗
            </a>
          </div>

          <p className="text-sm font-semibold mb-1" dir="auto" style={{ color: '#fff' }}>{irProfile.title}</p>
          <p className="text-[12px] leading-relaxed mb-2" dir="auto"
            style={{ color: 'rgba(255,255,255,0.6)' }}>
            {irProfile.body.length > 260 ? `${irProfile.body.slice(0, 260)}…` : irProfile.body}
          </p>
          {irProfile.phone && (
            <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {irProfile.phone} · relay number, same on every profile
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>
      ) : users.length === 0 ? (
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {noLeadsForIr !== null ? (
            <>
              <p>
                {irProfile
                  ? <>No member has sent an interest on <strong style={{ color: '#fff' }}>IR #{noLeadsForIr}</strong> yet.</>
                  : <>No profile exists at <strong style={{ color: '#fff' }}>IR #{noLeadsForIr}</strong> — the feed has fewer entries than that.</>}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                An IR # is a profile, not an account — searching one shows the profile above and lists the
                members interested in it.
              </p>
            </>
          ) : (
            <>
              <p>No users found.</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <strong>IR #12</strong> lists members interested in that profile. Email and name match on any
                part. An account ID must be the <strong>complete</strong> uuid — tap the ID under any user to copy it.
              </p>
            </>
          )}
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

// ── Tab: Verification ────────────────────────────────────────────────────────

interface VerificationRow {
  id: string;
  user_id: string;
  profession_key: string;
  doc_type: string;
  doc_reference: string | null;
  doc_url: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  applicant: { name: string | null; email: string | null } | null;
}

/**
 * The human gate. Approving here is the ONLY path in the app that grants a
 * profession badge, and rejecting is a first-class outcome that the applicant
 * sees with its reason — so the reject action deliberately demands one rather
 * than letting an admin dismiss someone silently.
 *
 * The queue sorts oldest-first (see /api/admin/verification) so nobody sits
 * unreviewed indefinitely.
 */
function VerificationTab({ toast }: { toast: (m: string) => void }) {
  const { professions }       = useProfessions();
  const [items, setItems]     = useState<VerificationRow[]>([]);
  const [filter, setFilter]   = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/verification?status=${f}`);
      if (!res.ok) { toast('Could not load verification requests'); return; }
      const data = await res.json();
      setItems((data.requests ?? []) as VerificationRow[]);
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { queueMicrotask(() => load(filter)); }, [load, filter]);

  const review = async (id: string, action: 'approve' | 'reject') => {
    let reason = '';
    if (action === 'reject') {
      // The applicant is shown this verbatim, so it has to say something
      // actionable — "not approved" alone reads as a broken app.
      reason = (window.prompt('Why is this being rejected? The applicant will see this.') ?? '').trim();
      if (!reason) return;
    }

    setBusyId(id);
    try {
      const res  = await fetch('/api/admin/verification', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error ?? 'Update failed'); return; }

      // Drop the row from the pending queue; other filters just reload.
      if (filter === 'pending') setItems(list => list.filter(r => r.id !== id));
      else load(filter);
      toast(action === 'approve' ? 'Verified — badge is live' : 'Rejected');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">Verification</h1>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Profession claims awaiting review. Approving grants the badge and adds the member
        to their cohort; rejecting is shown to the applicant with your reason.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="rounded-full px-4 py-1.5 text-xs font-bold capitalize"
            style={filter === f
              ? { background: GREEN, color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
            {f}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {filter === 'pending' ? 'Nothing waiting for review.' : 'Nothing here.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map(r => (
          <div key={r.id} className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-bold">
                {professionIcon(professions, r.profession_key)} {professionLabel(professions, r.profession_key)}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  background: r.status === 'approved' ? GREEN_BG
                            : r.status === 'rejected' ? 'rgba(255,107,107,0.15)'
                            : 'rgba(255,255,255,0.08)',
                  color: r.status === 'approved' ? GREEN
                       : r.status === 'rejected' ? '#FF6B6B'
                       : 'rgba(255,255,255,0.6)',
                }}>
                {r.status}
              </span>
            </div>

            <p className="text-sm mb-1">
              {r.applicant?.name || 'Member'}{' '}
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{r.applicant?.email}</span>
            </p>

            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <strong>{r.doc_type.replace(/_/g, ' ')}:</strong>{' '}
              {r.doc_reference || <em>none given</em>}
            </p>

            {r.doc_url && (
              <a href={r.doc_url} target="_blank" rel="noopener noreferrer"
                className="text-xs underline" style={{ color: GREEN }}>
                Open submitted document
              </a>
            )}

            {r.note && (
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{r.note}</p>
            )}

            {r.reject_reason && (
              <p className="text-xs mt-1" style={{ color: '#FF6B6B' }}>
                Rejected: {r.reject_reason}
              </p>
            )}

            <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Applied {new Date(r.created_at).toLocaleString()}
              {r.reviewed_by && ` · reviewed by ${r.reviewed_by}`}
            </p>

            {r.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => review(r.id, 'approve')} disabled={busyId === r.id}
                  className="rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  style={{ background: GREEN, color: '#fff', border: 'none' }}>
                  Approve
                </button>
                <button onClick={() => review(r.id, 'reject')} disabled={busyId === r.id}
                  className="rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.35)' }}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Professions ─────────────────────────────────────────────────────────

const BLANK_FORM = {
  key: '', label: '', labelUr: '', icon: '', slug: '',
  accepts: [] as DocType[], proofHint: '', sortOrder: 100, active: true,
};

/**
 * Edit the profession vocabulary — the closed list that decides who can even
 * apply for a badge.
 *
 * Two constraints are deliberately enforced in the UI as well as the route:
 *   • The key is fixed once created. It is stored on every verified member's
 *     profile, so renaming it would silently un-badge them.
 *   • There is no delete, only Retire. A retired profession disappears from
 *     the apply form while existing members keep their badge.
 *
 * Adding a profession also creates its cohort circle (ir_upsert_profession),
 * so there is no second step to forget.
 */
function ProfessionsTab({ toast }: { toast: (m: string) => void }) {
  const [items, setItems]     = useState<Profession[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({ ...BLANK_FORM });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/professions');
      if (!res.ok) { toast('Could not load professions'); return; }
      const data = await res.json();
      setItems((data.professions ?? []) as Profession[]);
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const reset = () => { setForm({ ...BLANK_FORM }); setEditingKey(null); setError(null); };

  const edit = (p: Profession) => {
    setEditingKey(p.key);
    setError(null);
    setForm({
      key: p.key, label: p.label, labelUr: p.label_ur ?? '', icon: p.icon,
      slug: p.slug, accepts: p.accepts, proofHint: p.proof_hint ?? '',
      sortOrder: p.sort_order, active: p.active,
    });
  };

  const toggleDoc = (d: DocType) => setForm(f => ({
    ...f,
    accepts: f.accepts.includes(d) ? f.accepts.filter(x => x !== d) : [...f.accepts, d],
  }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/professions', {
        method: editingKey ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }

      // The public vocabulary just changed; drop the client cache so badges
      // and the apply form pick it up without a reload.
      invalidateProfessions();
      toast(editingKey ? 'Profession updated' : 'Profession added — circle created');
      reset();
      load();
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (p: Profession, active: boolean) => {
    const res = await fetch('/api/admin/professions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: p.key, label: p.label, labelUr: p.label_ur, icon: p.icon, slug: p.slug,
        accepts: p.accepts, proofHint: p.proof_hint, sortOrder: p.sort_order, active,
      }),
    });
    if (res.ok) {
      invalidateProfessions();
      toast(active ? 'Profession restored' : 'Profession retired');
      load();
    } else {
      toast('Update failed');
    }
  };

  const field = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
  } as const;

  return (
    <div>
      <h1 className="text-xl font-extrabold mb-1">Professions</h1>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
        The list members can apply to be verified under. Adding one also creates its
        circle. Only add professions with a credential you can actually check — an
        unverifiable badge teaches members the gate means nothing.
      </p>

      {/* ── Add / edit form ── */}
      <div className="rounded-2xl p-4 mb-6"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="text-sm font-bold mb-3">
          {editingKey ? `Edit "${editingKey}"` : 'Add a profession'}
        </p>

        <div className="flex flex-wrap gap-2 mb-2">
          <input
            value={form.key}
            onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
            disabled={!!editingKey}
            placeholder="key (e.g. lawyer)"
            className="rounded-xl px-3 py-2 text-sm text-white outline-none disabled:opacity-40"
            style={{ ...field, width: 170 }}
          />
          <input
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Label (e.g. Lawyer)"
            className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...field, minWidth: 170 }}
          />
          <input
            value={form.icon}
            onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            placeholder="⚖️"
            className="rounded-xl px-3 py-2 text-sm text-white outline-none text-center"
            style={{ ...field, width: 66 }}
          />
        </div>

        {editingKey && (
          <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
            The key cannot change — verified members are stored against it.
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-2">
          <input
            value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
            placeholder="circle slug (auto from label)"
            className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...field, minWidth: 170 }}
          />
          <input
            value={form.labelUr}
            onChange={e => setForm(f => ({ ...f, labelUr: e.target.value }))}
            placeholder="اردو label"
            className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...field, minWidth: 140 }}
          />
          <input
            type="number"
            value={form.sortOrder}
            onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            placeholder="order"
            className="rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...field, width: 90 }}
          />
        </div>

        <p className="text-[11px] mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Accepted proof (at least one):
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {DOC_TYPES.map(d => (
            <button key={d} type="button" onClick={() => toggleDoc(d)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
              style={form.accepts.includes(d)
                ? { background: GREEN_BG, color: GREEN, border: `1px solid ${GREEN}` }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {DOC_LABELS[d]}
            </button>
          ))}
        </div>

        <textarea
          value={form.proofHint}
          onChange={e => setForm(f => ({ ...f, proofHint: e.target.value }))}
          rows={2}
          placeholder="What to ask the applicant for — shown on the apply form."
          className="w-full resize-none rounded-xl px-3 py-2 text-sm text-white outline-none mb-2"
          style={field}
        />

        {error && <p className="text-xs mb-2" style={{ color: '#FF6B6B' }}>{error}</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
            style={{ background: GREEN, color: '#fff', border: 'none' }}>
            {saving ? 'Saving…' : editingKey ? 'Save changes' : 'Add profession'}
          </button>
          {editingKey && (
            <button onClick={reset}
              className="rounded-xl px-4 py-2 text-xs font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: 'none' }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Existing ── */}
      {loading && <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>}

      <div className="flex flex-col gap-2">
        {items.map(p => (
          <div key={p.key} className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              opacity: p.active ? 1 : 0.5,
            }}>
            <span className="text-xl" aria-hidden>{p.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">
                {p.label}
                {!p.active && (
                  <span className="ml-2 text-[10px] font-bold uppercase"
                    style={{ color: 'rgba(255,255,255,0.4)' }}>retired</span>
                )}
              </p>
              <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {p.key} · /{p.slug} · {p.accepts.length} proof type{p.accepts.length === 1 ? '' : 's'}
              </p>
            </div>
            <button onClick={() => edit(p)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none' }}>
              Edit
            </button>
            <button onClick={() => setActive(p, !p.active)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold shrink-0"
              style={p.active
                ? { background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: 'none' }
                : { background: GREEN_BG, color: GREEN, border: 'none' }}>
              {p.active ? 'Retire' : 'Restore'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
