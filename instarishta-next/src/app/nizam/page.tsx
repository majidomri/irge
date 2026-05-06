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
type MainTab = 'overview' | 'users' | 'channels' | 'posts' | 'stories' | 'featured' | 'security' | 'setup';
type ContentTab = 'channels' | 'posts' | 'stories';

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
  none:     { label: 'No Plan',  color: '#696969', bg: '#f0f0f0' },
  silver:   { label: 'Silver',   color: '#7B8FA1', bg: '#e8edf2' },
  gold:     { label: 'Gold',     color: '#C8960C', bg: '#fdf3ce' },
  diamond:  { label: 'Diamond',  color: '#2563EB', bg: '#dbeafe' },
  platinum: { label: 'Platinum', color: '#006241', bg: '#d1fae5' },
};

interface FeaturedRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string | null;
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

const CREDITS_SQL = `-- Step: Enable contact credit balance system (run once in Supabase SQL Editor)

-- 1. Allow logged-in users to read their own credit balance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_profiles' AND policyname = 'users_read_own_profile'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_profile ON public.ir_user_profiles FOR SELECT USING (auth.uid() = id)';
  END IF;
END $$;

-- 2. Atomic decrement function (SECURITY DEFINER bypasses deny_all RLS for UPDATE)
CREATE OR REPLACE FUNCTION public.ir_decrement_credit()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE remaining INT;
BEGIN
  UPDATE public.ir_user_profiles
  SET contact_credits = GREATEST(contact_credits - 1, 0),
      updated_at = NOW()
  WHERE id = auth.uid() AND contact_credits > 0
  RETURNING contact_credits INTO remaining;
  RETURN COALESCE(remaining, 0);
END;
$$;

-- 3. Welcome credits: new signups automatically receive 20 credits
ALTER TABLE public.ir_user_profiles
  ALTER COLUMN contact_credits SET DEFAULT 20;

-- Trigger to set 20 credits on first insert (covers rows with explicit NULL)
CREATE OR REPLACE FUNCTION public.ir_set_welcome_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.contact_credits IS NULL THEN
    NEW.contact_credits := 20;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ir_welcome_credits_trigger ON public.ir_user_profiles;
CREATE TRIGGER ir_welcome_credits_trigger
  BEFORE INSERT ON public.ir_user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ir_set_welcome_credits();`;

const USER_USAGE_SQL = `-- Rolling-window usage table for audio plays and profile views (run once in Supabase SQL Editor)

CREATE TABLE IF NOT EXISTS public.ir_user_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL CHECK (feature IN ('audio','view')),
  used_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ir_user_usage_user_feature_idx
  ON public.ir_user_usage (user_id, feature, used_at DESC);

ALTER TABLE public.ir_user_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_usage' AND policyname = 'users_insert_own_usage'
  ) THEN
    EXECUTE 'CREATE POLICY users_insert_own_usage ON public.ir_user_usage FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_usage' AND policyname = 'users_read_own_usage'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_usage ON public.ir_user_usage FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;`;

const FEATURED_SQL = `-- Run this in Supabase SQL Editor to enable Featured Carousel

CREATE TABLE IF NOT EXISTS public.ir_featured (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  link_url    TEXT,
  placement   TEXT DEFAULT 'all'
              CHECK (placement IN ('home','channels','profiles','all')),
  active      BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ir_featured ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_featured' AND policyname = 'featured_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY featured_public_read ON public.ir_featured FOR SELECT USING (active = true)';
  END IF;
END $$;`;

const USER_LINK_SQL = `-- Step 3: Link posts & stories to user profiles (run once in Supabase SQL Editor)

ALTER TABLE public.ir_posts   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ir_stories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ir_posts_user_idx   ON public.ir_posts(user_id);
CREATE INDEX IF NOT EXISTS ir_stories_user_idx ON public.ir_stories(user_id);`;

const IRIS_SQL = `-- IRIS: Identity, Recognition & Integrity System
-- Run once in Supabase SQL Editor to enable device fingerprinting + audit logging

-- 1. Device fingerprint registry (one row per unique device)
CREATE TABLE IF NOT EXISTS public.ir_fingerprints (
  fp_hash              TEXT PRIMARY KEY,
  canvas_hash          TEXT,
  webgl_hash           TEXT,
  audio_hash           TEXT,
  platform             TEXT,
  language             TEXT,
  timezone             TEXT,
  screen               TEXT,
  hardware_concurrency INT,
  device_memory        REAL,
  touch_points         INT,
  user_agent           TEXT,
  first_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_ip              TEXT,
  visit_count          INT DEFAULT 1
);

-- 2. Event log (signup / login / contact_unlock / plan_purchase / referral_click)
CREATE TABLE IF NOT EXISTS public.ir_fp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash    TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  ip_address TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ir_fp_events_fp_idx    ON public.ir_fp_events(fp_hash);
CREATE INDEX IF NOT EXISTS ir_fp_events_user_idx  ON public.ir_fp_events(user_id);
CREATE INDEX IF NOT EXISTS ir_fp_events_event_idx ON public.ir_fp_events(event, created_at DESC);

ALTER TABLE public.ir_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ir_fp_events    ENABLE ROW LEVEL SECURITY;
-- All access is via SECURITY DEFINER RPCs below — no direct client access

-- 3. RPC: log fingerprint event (called on every page load + login + contact)
CREATE OR REPLACE FUNCTION public.ir_log_fp(
  p_fp_hash              TEXT,
  p_canvas_hash          TEXT    DEFAULT NULL,
  p_webgl_hash           TEXT    DEFAULT NULL,
  p_audio_hash           TEXT    DEFAULT NULL,
  p_platform             TEXT    DEFAULT NULL,
  p_language             TEXT    DEFAULT NULL,
  p_timezone             TEXT    DEFAULT NULL,
  p_screen               TEXT    DEFAULT NULL,
  p_hardware_concurrency INT     DEFAULT NULL,
  p_device_memory        REAL    DEFAULT NULL,
  p_touch_points         INT     DEFAULT NULL,
  p_user_agent           TEXT    DEFAULT NULL,
  p_event                TEXT    DEFAULT 'page_view',
  p_metadata             JSONB   DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_multi_cnt  INT  := 0;
  v_suspicious BOOLEAN := FALSE;
BEGIN
  -- Upsert fingerprint record
  INSERT INTO public.ir_fingerprints
    (fp_hash, canvas_hash, webgl_hash, audio_hash, platform, language, timezone,
     screen, hardware_concurrency, device_memory, touch_points, user_agent, last_seen_at, visit_count)
  VALUES
    (p_fp_hash, p_canvas_hash, p_webgl_hash, p_audio_hash, p_platform, p_language, p_timezone,
     p_screen, p_hardware_concurrency, p_device_memory, p_touch_points, p_user_agent, NOW(), 1)
  ON CONFLICT (fp_hash) DO UPDATE
    SET last_seen_at  = NOW(),
        visit_count   = ir_fingerprints.visit_count + 1,
        user_agent    = COALESCE(p_user_agent,   ir_fingerprints.user_agent),
        canvas_hash   = COALESCE(p_canvas_hash,  ir_fingerprints.canvas_hash),
        webgl_hash    = COALESCE(p_webgl_hash,   ir_fingerprints.webgl_hash),
        audio_hash    = COALESCE(p_audio_hash,   ir_fingerprints.audio_hash);

  -- Insert event
  INSERT INTO public.ir_fp_events (fp_hash, user_id, event, metadata)
  VALUES (p_fp_hash, v_uid, p_event, p_metadata);

  -- Multi-account abuse detection (only for authenticated users)
  IF v_uid IS NOT NULL THEN
    SELECT COUNT(DISTINCT user_id) INTO v_multi_cnt
    FROM public.ir_fp_events
    WHERE fp_hash = p_fp_hash AND user_id IS NOT NULL;

    v_suspicious := v_multi_cnt > 1;

    -- Zero out welcome credits for suspected multi-account abusers
    -- (only if credits are still at welcome level ≤20, not admin-granted paid credits)
    IF v_suspicious THEN
      UPDATE public.ir_user_profiles
      SET    contact_credits = 0, updated_at = NOW()
      WHERE  id = v_uid
        AND  contact_credits > 0
        AND  contact_credits <= 20;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'suspicious', v_suspicious,
    'user_count', v_multi_cnt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_log_fp TO anon, authenticated;

-- 4. RPC: check if fingerprint has any associated account (for anon credit gating)
CREATE OR REPLACE FUNCTION public.ir_fp_has_account(p_fp_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.ir_fp_events
    WHERE  fp_hash = p_fp_hash AND user_id IS NOT NULL
    LIMIT  1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_fp_has_account TO anon, authenticated;

-- 5. RPC: admin — suspicious fingerprints (same device, multiple accounts)
CREATE OR REPLACE FUNCTION public.ir_admin_suspicious_fps()
RETURNS TABLE (
  fp_hash     TEXT,
  user_count  BIGINT,
  last_seen   TIMESTAMPTZ,
  event_count BIGINT,
  last_ip     TEXT,
  platform    TEXT,
  timezone    TEXT,
  screen      TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.fp_hash,
    COUNT(DISTINCT e.user_id)::BIGINT,
    MAX(e.created_at),
    COUNT(*)::BIGINT,
    f.last_ip,
    f.platform,
    f.timezone,
    f.screen
  FROM public.ir_fp_events e
  LEFT JOIN public.ir_fingerprints f USING (fp_hash)
  WHERE e.user_id IS NOT NULL
  GROUP BY e.fp_hash, f.last_ip, f.platform, f.timezone, f.screen
  HAVING COUNT(DISTINCT e.user_id) > 1
  ORDER BY COUNT(DISTINCT e.user_id) DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_admin_suspicious_fps TO authenticated;

-- 6. RPC: admin — recent event stream (includes IP)
CREATE OR REPLACE FUNCTION public.ir_admin_fp_events(p_limit INT DEFAULT 200)
RETURNS TABLE (
  id         UUID,
  fp_hash    TEXT,
  user_id    UUID,
  event      TEXT,
  ip_address TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ,
  platform   TEXT,
  timezone   TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.fp_hash, e.user_id, e.event, e.ip_address, e.metadata, e.created_at,
    f.platform, f.timezone
  FROM public.ir_fp_events e
  LEFT JOIN public.ir_fingerprints f USING (fp_hash)
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_admin_fp_events TO authenticated;`;

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

// Combined idempotent migration — paste into Supabase SQL Editor to set up everything at once
const FULL_MIGRATION_SQL = [IRIS_SQL, USER_USAGE_SQL, FEATURED_SQL, USER_LINK_SQL, SETUP_SQL, CREDITS_SQL].join('\n\n-- ──────────────────────────────────────\n\n');

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

  // Featured
  const [featured,       setFeatured]       = useState<FeaturedRow[]>([]);
  const [featuredLoading,setFeaturedLoading]= useState(false);

  // Security / IRIS
  const [suspFps,       setSuspFps]       = useState<Record<string, unknown>[]>([]);
  const [recentEvents,  setRecentEvents]  = useState<Record<string, unknown>[]>([]);
  const [secLoading,    setSecLoading]    = useState(false);
  const [fTitle,  setFTitle]  = useState('');
  const [fDesc,   setFDesc]   = useState('');
  const [fImage,  setFImage]  = useState('');
  const [fLink,   setFLink]   = useState('');
  const [fPlace,  setFPlace]  = useState<'home'|'channels'|'profiles'|'all'>('all');
  const [fOrder,  setFOrder]  = useState(0);
  const featImgRef = useRef<HTMLInputElement>(null);

  // Users
  const [users,           setUsers]           = useState<UserRow[]>([]);
  const [usersLoading,    setUsersLoading]    = useState(false);
  const [userSearch,      setUserSearch]      = useState('');
  const [editingUser,     setEditingUser]     = useState<UserRow | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [userView,        setUserView]        = useState<'gallery' | 'table'>('gallery');
  const [userPlanFilter,  setUserPlanFilter]  = useState('all');
  const [userStatusFilter,setUserStatusFilter]= useState<'all'|'active'|'banned'>('all');
  const [userContentFilter,setUserContentFilter]= useState<'all'|'has_post'|'has_story'|'no_content'>('all');
  const [userSort,        setUserSort]        = useState<'newest'|'oldest'|'name'|'plan'>('newest');
  const [userPage,        setUserPage]        = useState(0);
  const [userPostMap,     setUserPostMap]     = useState<Record<string, IPost[]>>({});
  const [userStoryMap,    setUserStoryMap]    = useState<Record<string, IStory[]>>({});
  const [banningUser,     setBanningUser]     = useState<UserRow | null>(null);
  const [contentUserId,   setContentUserId]   = useState('');

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

  const loadUserContent = useCallback(async () => {
    try {
      const [{ data: posts }, { data: stories }] = await Promise.all([
        supabase.from('ir_posts').select('id, user_id, image, thumb, title, created_at').not('user_id', 'is', null),
        supabase.from('ir_stories').select('id, user_id, image, created_at').not('user_id', 'is', null),
      ]);
      const postMap: Record<string, IPost[]> = {};
      const storyMap: Record<string, IStory[]> = {};
      ((posts ?? []) as IPost[]).forEach(p => { if (p.user_id) { postMap[p.user_id] = [...(postMap[p.user_id] ?? []), p]; } });
      ((stories ?? []) as IStory[]).forEach(s => { if (s.user_id) { storyMap[s.user_id] = [...(storyMap[s.user_id] ?? []), s]; } });
      setUserPostMap(postMap);
      setUserStoryMap(storyMap);
    } catch { /* user_id columns may not exist yet — run Step 3 SQL in Setup */ }
  }, []);

  useEffect(() => {
    if (tab === 'users' && token) { loadUsers(); loadUserContent(); }
  }, [tab, token, loadUsers, loadUserContent]);

  const loadFeatured = useCallback(async () => {
    setFeaturedLoading(true);
    const { data } = await supabase.from('ir_featured').select('*').order('sort_order', { ascending: true });
    setFeatured((data as FeaturedRow[]) ?? []);
    setFeaturedLoading(false);
  }, []);

  useEffect(() => { if (tab === 'featured' && session) loadFeatured(); }, [tab, session, loadFeatured]);

  const loadSecurity = useCallback(async () => {
    setSecLoading(true);
    const [{ data: susp }, { data: evts }] = await Promise.all([
      supabase.rpc('ir_admin_suspicious_fps'),
      supabase.rpc('ir_admin_fp_events', { p_limit: 150 }),
    ]);
    setSuspFps((susp as Record<string, unknown>[]) ?? []);
    setRecentEvents((evts as Record<string, unknown>[]) ?? []);
    setSecLoading(false);
  }, []);

  useEffect(() => { if (tab === 'security' && session) loadSecurity(); }, [tab, session, loadSecurity]);

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

  const banAndRemove = async (u: UserRow) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ is_banned: true }),
    });
    if (!res.ok) { showToast('Error banning user'); setBanningUser(null); return; }
    handleUserSaved(u.id, { is_banned: true });
    const userPosts   = userPostMap[u.id] ?? [];
    const userStories = userStoryMap[u.id] ?? [];
    await Promise.all([
      ...userPosts.map(p => supabase.from('ir_posts').delete().eq('id', p.id)),
      ...userStories.map(s => supabase.from('ir_stories').delete().eq('id', s.id)),
    ]);
    setUserPostMap(prev   => { const n = { ...prev }; delete n[u.id]; return n; });
    setUserStoryMap(prev  => { const n = { ...prev }; delete n[u.id]; return n; });
    showToast(`Banned + removed ${userPosts.length + userStories.length} item(s) ✓`);
    setBanningUser(null);
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

  const isSchemaError = (msg: string) => msg.includes('schema cache') || msg.includes('column') || msg.includes('does not exist');

  const submitPost = async () => {
    if (!active || !npImage) { showToast('Select a channel and upload an image.'); return; }
    const base = { channel_id: active.id, image: npImage, thumb: npThumb || null, title: npTitle || null, caption: npCaption || null, audio_url: npAudio || null };
    let res = await supabase.from('ir_posts').insert([{ ...base, ...(contentUserId ? { user_id: contentUserId } : {}) }]).select().single();
    if (res.error && contentUserId && isSchemaError(res.error.message)) {
      showToast('Run Step 3 SQL in Setup to enable user linking — publishing without it');
      res = await supabase.from('ir_posts').insert([base]).select().single();
    }
    if (res.error) { showToast('Error: ' + res.error.message); return; }
    setPosts(prev => [res.data, ...prev]);
    if (contentUserId && !res.error) setUserPostMap(prev => ({ ...prev, [contentUserId]: [res.data as IPost, ...(prev[contentUserId] ?? [])] }));
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
      const base = { channel_id: active.id, image: url };
      let res = await supabase.from('ir_stories').insert([{ ...base, ...(contentUserId ? { user_id: contentUserId } : {}) }]).select().single();
      if (res.error && contentUserId && isSchemaError(res.error.message)) {
        showToast('Run Step 3 SQL in Setup to enable user linking — publishing without it');
        res = await supabase.from('ir_stories').insert([base]).select().single();
      }
      if (res.error) throw res.error;
      setStories(prev => [res.data, ...prev]);
      if (contentUserId) setUserStoryMap(prev => ({ ...prev, [contentUserId]: [res.data as IStory, ...(prev[contentUserId] ?? [])] }));
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
  const PAGE_SIZE = 20;

  const filteredUsers = users
    .filter(u => {
      const q = userSearch.toLowerCase();
      if (q && !(u.email ?? '').toLowerCase().includes(q) && !(u.full_name ?? '').toLowerCase().includes(q)) return false;
      if (userPlanFilter !== 'all' && u.plan !== userPlanFilter) return false;
      if (userStatusFilter === 'active' && u.is_banned) return false;
      if (userStatusFilter === 'banned' && !u.is_banned) return false;
      if (userContentFilter === 'has_post'   && !(userPostMap[u.id]?.length  > 0)) return false;
      if (userContentFilter === 'has_story'  && !(userStoryMap[u.id]?.length > 0)) return false;
      if (userContentFilter === 'no_content' && ((userPostMap[u.id]?.length ?? 0) > 0 || (userStoryMap[u.id]?.length ?? 0) > 0)) return false;
      return true;
    })
    .sort((a, b) => {
      if (userSort === 'name')   return (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '');
      if (userSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (userSort === 'plan')   { const o = ['platinum','diamond','gold','silver','none']; return o.indexOf(a.plan) - o.indexOf(b.plan); }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages     = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE);

  const planCounts = users.reduce((acc, u) => {
    acc[u.plan] = (acc[u.plan] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalActive  = users.filter(u => !u.is_banned && u.plan !== 'none').length;
  const totalBanned  = users.filter(u => u.is_banned).length;
  const recentUsers  = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  const uploadFeatImg = async () => {
    const file = featImgRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const url = await uploadToCloud(file, 'featured'); setFImage(url); showToast('Image ready ✓'); }
    catch (e: unknown) { showToast('Upload failed: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const submitFeatured = async () => {
    if (!fTitle.trim()) { showToast('Title is required'); return; }
    const { data, error } = await supabase.from('ir_featured').insert([{
      title: fTitle.trim(), description: fDesc.trim() || null,
      image_url: fImage || null, link_url: fLink.trim() || null,
      placement: fPlace, sort_order: fOrder, active: true,
    }]).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setFeatured(prev => [...prev, data as FeaturedRow]);
    setFTitle(''); setFDesc(''); setFImage(''); setFLink(''); setFOrder(0); setFPlace('all');
    showToast('Featured item added ✓');
  };

  const toggleFeatured = async (item: FeaturedRow) => {
    const active = !item.active;
    const { error } = await supabase.from('ir_featured').update({ active }).eq('id', item.id);
    if (!error) setFeatured(prev => prev.map(f => f.id === item.id ? { ...f, active } : f));
  };

  const deleteFeatured = async (id: string) => {
    const { error } = await supabase.from('ir_featured').delete().eq('id', id);
    if (!error) setFeatured(prev => prev.filter(f => f.id !== id));
    showToast('Deleted');
  };

  const NAV: { id: MainTab; icon: string; label: string; badge?: number }[] = [
    { id: 'overview',  icon: '📊', label: 'Overview' },
    { id: 'users',     icon: '👥', label: 'Users', badge: users.length },
    { id: 'channels',  icon: '📡', label: 'Channels', badge: channels.length },
    { id: 'posts',     icon: '🖼️', label: 'Posts' },
    { id: 'stories',   icon: '✨', label: 'Stories' },
    { id: 'featured',  icon: '⭐', label: 'Featured', badge: featured.filter(f => f.active).length },
    { id: 'security',  icon: '🛡️', label: 'Security', badge: suspFps.length || undefined },
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

      {/* Ban + Remove Content confirm */}
      {banningUser && (() => {
        const bp = userPostMap[banningUser.id] ?? [];
        const bs = userStoryMap[banningUser.id] ?? [];
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="rounded-2xl p-6 w-96" style={{ background: '#1a2820' }}>
              <p className="font-bold text-white mb-1">Ban + Remove Content?</p>
              <p className="text-[0.82rem] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{banningUser.email}</p>
              <p className="text-[0.82rem] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                This will block login access and permanently delete <strong style={{ color: '#FF6B3D' }}>{bp.length} post{bp.length !== 1 ? 's' : ''}</strong> + <strong style={{ color: '#FF6B3D' }}>{bs.length} stor{bs.length !== 1 ? 'ies' : 'y'}</strong> linked to this account.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setBanningUser(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
                <button onClick={() => banAndRemove(banningUser)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#CF4500', color: '#fff' }}>Ban + Remove All</button>
              </div>
            </div>
          </div>
        );
      })()}

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
                        {(u.email?.[0] ?? '?').toUpperCase()}
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
            {/* Header */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <h1 className="text-[1.4rem] font-bold text-white mb-1">Users</h1>
                <p className="text-[0.82rem]" style={{ color: 'rgba(255,255,255,0.45)' }}>{filteredUsers.length} of {users.length} accounts</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <div className="flex rounded-full overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {(['gallery','table'] as const).map(v => (
                    <button key={v} onClick={() => setUserView(v)} className="px-4 py-1.5 text-xs font-bold transition-colors"
                      style={{ background: userView === v ? '#00A86B' : 'transparent', color: userView === v ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                      {v === 'gallery' ? '⊞ Gallery' : '≡ Table'}
                    </button>
                  ))}
                </div>
                <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                  placeholder="Search…" className="rounded-xl px-4 py-2 text-sm outline-none w-44"
                  style={{ background: '#1a2820', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <button onClick={() => { loadUsers(); loadUserContent(); }} className="px-3 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}>↻</button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap gap-2 mb-6">
              <div className="flex gap-1 rounded-full p-1" style={{ background: '#1a2820' }}>
                {[['all','All'], ...Object.entries(PLAN_META).map(([k,m]) => [k, m.label])].map(([key, label]) => (
                  <button key={key} onClick={() => { setUserPlanFilter(key); setUserPage(0); }}
                    className="px-3 py-1 rounded-full text-[0.7rem] font-semibold transition-all"
                    style={{ background: userPlanFilter === key ? '#00A86B' : 'transparent', color: userPlanFilter === key ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-full p-1" style={{ background: '#1a2820' }}>
                {(['all','active','banned'] as const).map(key => (
                  <button key={key} onClick={() => { setUserStatusFilter(key); setUserPage(0); }}
                    className="px-3 py-1 rounded-full text-[0.7rem] font-semibold capitalize transition-all"
                    style={{ background: userStatusFilter === key ? '#00A86B' : 'transparent', color: userStatusFilter === key ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {key}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-full p-1" style={{ background: '#1a2820' }}>
                {([['all','All'],['has_post','Has Post'],['has_story','Has Story'],['no_content','No Content']] as [string,string][]).map(([key,label]) => (
                  <button key={key} onClick={() => { setUserContentFilter(key as typeof userContentFilter); setUserPage(0); }}
                    className="px-3 py-1 rounded-full text-[0.7rem] font-semibold transition-all"
                    style={{ background: userContentFilter === key ? '#00A86B' : 'transparent', color: userContentFilter === key ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <select value={userSort} onChange={e => { setUserSort(e.target.value as typeof userSort); setUserPage(0); }}
                className="rounded-full px-3 py-1.5 text-[0.7rem] font-semibold outline-none"
                style={{ background: '#1a2820', color: 'rgba(255,255,255,0.65)', border: 'none' }}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A–Z</option>
                <option value="plan">Plan Level</option>
              </select>
            </div>

            {usersLoading ? (
              <div className="flex items-center justify-center py-24"><div className="spinner" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-4xl mb-3">👥</p>
                <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>No users found</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Make sure the ir_user_profiles table exists (see Setup tab)</p>
              </div>
            ) : userView === 'gallery' ? (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {paginatedUsers.map(u => {
                    const meta        = PLAN_META[u.plan] ?? PLAN_META.none;
                    const uPosts      = userPostMap[u.id]  ?? [];
                    const uStories    = userStoryMap[u.id] ?? [];
                    const initials    = u.full_name
                      ? u.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                      : (u.email?.[0] ?? '?').toUpperCase();
                    return (
                      <div key={u.id} style={{ background: '#1a2820', borderRadius: 16, overflow: 'hidden', opacity: u.is_banned ? 0.72 : 1 }}>
                        {/* Media row: story left, post right */}
                        <div style={{ display: 'flex', height: 108, gap: 2, background: '#0e1a14' }}>
                          {[{ items: uStories, label: 'STORY', icon: '✨' }, { items: uPosts, label: 'POST', icon: '🖼️' }].map(({ items, label, icon }) => (
                            <div key={label} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                              {(items[0] as IPost | IStory | undefined) ? (
                                <img
                                  src={(items[0] as IPost).thumb ?? (items[0] as IPost | IStory).image}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 20, opacity: 0.2 }}>{icon}</span>
                                </div>
                              )}
                              <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                              {items.length > 1 && (
                                <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: 'rgba(0,168,107,0.75)', color: '#fff' }}>+{items.length - 1}</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Info */}
                        <div style={{ padding: '12px 13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {initials}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name ?? '—'}</p>
                              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.67rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7 }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: meta.bg, color: meta.color }}>{meta.label}</span>
                            {u.is_banned
                              ? <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(207,69,0,0.18)', color: '#FF6B3D' }}>Banned</span>
                              : <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(0,168,107,0.13)', color: '#00A86B' }}>Active</span>
                            }
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{u.contact_credits} cr</span>
                          </div>

                          <p style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.28)', margin: '0 0 10px' }}>
                            {uPosts.length}p · {uStories.length}s · {new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                          </p>

                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => setEditingUser(u)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)', border: 'none', cursor: 'pointer' }}>Edit</button>
                            <button
                              onClick={() => u.is_banned ? quickBan(u) : setBanningUser(u)}
                              style={{ flex: 2, padding: '5px 0', borderRadius: 7, fontSize: '0.68rem', fontWeight: 600, background: u.is_banned ? 'rgba(0,168,107,0.1)' : 'rgba(207,69,0,0.14)', color: u.is_banned ? '#00A86B' : '#FF6B3D', border: 'none', cursor: 'pointer' }}>
                              {u.is_banned ? 'Unban' : 'Ban + Remove'}
                            </button>
                            <button onClick={() => setDeletingId(u.id)} style={{ padding: '5px 8px', borderRadius: 7, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(207,69,0,0.08)', color: '#CF4500', border: 'none', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-8">
                    <button onClick={() => setUserPage(p => Math.max(0, p - 1))} disabled={userPage === 0}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: '#1a2820', color: userPage === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)', cursor: userPage === 0 ? 'default' : 'pointer' }}>
                      ← Prev
                    </button>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Page {userPage + 1} of {totalPages} &nbsp;·&nbsp; {filteredUsers.length} users
                    </span>
                    <button onClick={() => setUserPage(p => Math.min(totalPages - 1, p + 1))} disabled={userPage >= totalPages - 1}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: '#1a2820', color: userPage >= totalPages - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)', cursor: userPage >= totalPages - 1 ? 'default' : 'pointer' }}>
                      Next →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-2xl overflow-hidden" style={{ background: '#1a2820' }}>
                  <div className="grid text-[0.7rem] font-bold uppercase tracking-wider px-5 py-3"
                    style={{ gridTemplateColumns: '1fr 1fr 90px 70px 70px 100px 100px', color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <span>Email</span><span>Name</span><span>Plan</span><span>Credits</span><span>Content</span><span>Status</span><span>Actions</span>
                  </div>
                  {paginatedUsers.map((u, i) => {
                    const meta    = PLAN_META[u.plan] ?? PLAN_META.none;
                    const uPosts  = userPostMap[u.id]  ?? [];
                    const uStories= userStoryMap[u.id] ?? [];
                    return (
                      <div key={u.id} className="grid items-center px-5 py-3 text-sm"
                        style={{ gridTemplateColumns: '1fr 1fr 90px 70px 70px 100px 100px', borderBottom: i < paginatedUsers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', opacity: u.is_banned ? 0.55 : 1 }}>
                        <span className="text-white text-[0.78rem] truncate pr-2">{u.email}</span>
                        <span className="text-[0.75rem] truncate pr-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{u.full_name ?? '—'}</span>
                        <span><span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span></span>
                        <span className="text-[0.78rem] font-semibold" style={{ color: '#00A86B' }}>{u.contact_credits}</span>
                        <span className="text-[0.72rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>{uPosts.length}p · {uStories.length}s</span>
                        <span>
                          {u.is_banned
                            ? <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(207,69,0,0.15)', color: '#FF6B3D' }}>Banned</span>
                            : <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B' }}>Active</span>
                          }
                        </span>
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditingUser(u)} className="text-[0.68rem] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>Edit</button>
                          <button onClick={() => u.is_banned ? quickBan(u) : setBanningUser(u)} className="text-[0.68rem] font-semibold px-2.5 py-1 rounded-lg" style={{ background: u.is_banned ? 'rgba(0,168,107,0.1)' : 'rgba(207,69,0,0.1)', color: u.is_banned ? '#00A86B' : '#FF6B3D' }}>{u.is_banned ? 'Unban' : 'Ban'}</button>
                          <button onClick={() => setDeletingId(u.id)} className="text-[0.68rem] font-semibold px-2 py-1 rounded-lg" style={{ background: 'rgba(207,69,0,0.08)', color: '#CF4500' }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button onClick={() => setUserPage(p => Math.max(0, p - 1))} disabled={userPage === 0}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: '#1a2820', color: userPage === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)' }}>← Prev</button>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Page {userPage + 1} of {totalPages}</span>
                    <button onClick={() => setUserPage(p => Math.min(totalPages - 1, p + 1))} disabled={userPage >= totalPages - 1}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: '#1a2820', color: userPage >= totalPages - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)' }}>Next →</button>
                  </div>
                )}
              </>
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
                        <div className="mb-3">
                          <select value={contentUserId} onChange={e => setContentUserId(e.target.value)}
                            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: contentUserId ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                            <option value="">Link to user (optional)</option>
                            {users.map(u => <option key={u.id} value={u.id} style={{ color: '#141413' }}>{u.full_name ?? u.email}</option>)}
                          </select>
                        </div>
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

        {/* ── FEATURED ─────────────────────────────────────────────── */}
        {tab === 'featured' && (
          <div className="p-8 max-w-3xl">
            <h1 className="text-[1.4rem] font-bold text-white mb-1">Featured Carousel</h1>
            <p className="text-[0.82rem] mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Profile spotlights shown on Home, Channels &amp; Profiles pages
            </p>

            {/* Add form */}
            <div className="rounded-2xl p-6 mb-8" style={{ background: '#1a2820' }}>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Add New Spotlight</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Title *"
                  className="rounded-xl px-3 py-2.5 text-sm outline-none col-span-2"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Description (age · city · profession)"
                  className="rounded-xl px-3 py-2.5 text-sm outline-none col-span-2"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <input value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Link URL (e.g. /profiles?id=42)"
                  className="rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                <select value={fPlace} onChange={e => setFPlace(e.target.value as typeof fPlace)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
                  <option value="all" style={{ color: '#141413' }}>All pages</option>
                  <option value="home" style={{ color: '#141413' }}>Home only</option>
                  <option value="channels" style={{ color: '#141413' }}>Channels only</option>
                  <option value="profiles" style={{ color: '#141413' }}>Profiles only</option>
                </select>
                <div className="flex items-center gap-3">
                  <input type="number" value={fOrder} onChange={e => setFOrder(+e.target.value)} placeholder="Sort order"
                    className="w-24 rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>lower = first</span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={featImgRef} type="file" accept="image/*" className="hidden" onChange={uploadFeatImg} />
                <button onClick={() => featImgRef.current?.click()} disabled={uploading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  {uploading ? 'Uploading…' : fImage ? '✓ Change Photo' : 'Upload Photo'}
                </button>
                {fImage && <img src={fImage} alt="" className="w-12 h-12 rounded-xl object-cover" />}
                <button onClick={submitFeatured} className="px-5 py-2 rounded-xl text-sm font-bold ml-auto"
                  style={{ background: '#00A86B', color: '#fff' }}>
                  Add Spotlight
                </button>
              </div>
            </div>

            {/* List */}
            <p className="text-[0.7rem] font-bold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              All Items ({featured.length})
            </p>
            {featuredLoading ? (
              <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : featured.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2820' }}>
                <p className="text-3xl mb-3">⭐</p>
                <p className="font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  No spotlight items yet — add one above
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Make sure to run the Featured SQL in Setup tab first
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {featured.map(item => (
                  <div key={item.id} className="flex items-center gap-4 rounded-2xl p-4"
                    style={{ background: '#1a2820', opacity: item.active ? 1 : 0.5 }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-2xl"
                        style={{ background: 'rgba(0,168,107,0.12)' }}>⭐</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{item.title}</p>
                      {item.description && <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{item.description}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(0,168,107,0.15)', color: '#00A86B' }}>
                          {item.placement === 'all' ? 'All pages' : item.placement}
                        </span>
                        <span className="text-[0.65rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          order: {item.sort_order}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleFeatured(item)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{
                          background: item.active ? 'rgba(0,168,107,0.12)' : 'rgba(255,255,255,0.07)',
                          color: item.active ? '#00A86B' : 'rgba(255,255,255,0.45)',
                        }}>
                        {item.active ? 'Live' : 'Off'}
                      </button>
                      <button onClick={() => deleteFeatured(item.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: 'rgba(207,69,0,0.1)', color: '#CF4500' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SECURITY / IRIS ─────────────────────────────────────────── */}
        {tab === 'security' && (
          <div className="p-8 max-w-5xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-[1.4rem] font-bold text-white mb-1">Security — IRIS</h1>
                <p className="text-[0.82rem]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Device fingerprints · Multi-account abuse detection · Audit log
                </p>
              </div>
              <button
                onClick={loadSecurity}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >
                {secLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {/* Suspicious devices */}
            <div className="mb-8 rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(207,69,0,0.3)', background: 'rgba(207,69,0,0.06)' }}>
              <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(207,69,0,0.2)' }}>
                <span className="text-[0.65rem] font-bold tracking-widest uppercase" style={{ color: '#CF4500' }}>
                  🚨 Suspicious Devices — Same Fingerprint, Multiple Accounts ({suspFps.length})
                </span>
              </div>
              {suspFps.length === 0 ? (
                <p className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>No suspicious devices detected.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.78rem]">
                    <thead>
                      <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {['FP Hash (prefix)', 'Accounts', 'Events', 'Last IP', 'Platform', 'Timezone', 'Screen', 'Last seen'].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suspFps.map((fp, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'rgba(207,69,0,0.15)' }}>
                          <td className="px-4 py-2 font-mono" style={{ color: '#CF4500' }}>
                            {String(fp.fp_hash ?? '').slice(0, 12)}…
                          </td>
                          <td className="px-4 py-2 font-bold text-white">{String(fp.user_count)}</td>
                          <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(fp.event_count)}</td>
                          <td className="px-4 py-2 font-mono text-[0.7rem]" style={{ color: '#F0C040' }}>{String(fp.last_ip ?? '—')}</td>
                          <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(fp.platform ?? '—')}</td>
                          <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(fp.timezone ?? '—')}</td>
                          <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(fp.screen ?? '—')}</td>
                          <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {fp.last_seen ? new Date(fp.last_seen as string).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Event stream */}
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0e1a14' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <span className="text-[0.65rem] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Recent Events (last 150)
                </span>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-[0.75rem]">
                  <thead className="sticky top-0" style={{ background: '#0e1a14' }}>
                    <tr style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {['Time', 'Event', 'FP Hash', 'User ID', 'IP Address', 'Platform', 'TZ', 'Metadata'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((ev, i) => {
                      const EVENT_COLOR: Record<string, string> = {
                        login:          '#00A86B',
                        signup:         '#60A5FA',
                        contact_unlock: '#F0C040',
                        plan_purchase:  '#00C87A',
                        signout:        '#7B8FA1',
                        anon_visit:     'rgba(255,255,255,0.3)',
                        page_view:      'rgba(255,255,255,0.2)',
                        referral_click: '#C0397A',
                      };
                      const color = EVENT_COLOR[String(ev.event)] ?? 'rgba(255,255,255,0.5)';
                      const meta  = ev.metadata ? JSON.stringify(ev.metadata).slice(0, 60) : '—';
                      return (
                        <tr key={i} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <td className="px-3 py-1.5 whitespace-nowrap font-mono" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                            {ev.created_at ? new Date(ev.created_at as string).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                          <td className="px-3 py-1.5 font-semibold whitespace-nowrap" style={{ color }}>{String(ev.event)}</td>
                          <td className="px-3 py-1.5 font-mono" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem' }}>
                            {String(ev.fp_hash ?? '').slice(0, 10)}…
                          </td>
                          <td className="px-3 py-1.5 font-mono" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem' }}>
                            {ev.user_id ? String(ev.user_id).slice(0, 8) + '…' : 'anon'}
                          </td>
                          <td className="px-3 py-1.5 font-mono" style={{ color: '#F0C040', fontSize: '0.68rem' }}>{String(ev.ip_address ?? '—')}</td>
                          <td className="px-3 py-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{String(ev.platform ?? '—')}</td>
                          <td className="px-3 py-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{String(ev.timezone ?? '—')}</td>
                          <td className="px-3 py-1.5" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* IRIS SQL */}
            <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0e1a14' }}>
              <h3 className="font-bold text-white mb-1">IRIS Setup SQL</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Run once in Supabase SQL Editor to create fingerprint tables + RPCs
              </p>
              <pre className="rounded-xl p-4 text-[0.7rem] leading-relaxed overflow-x-auto" style={{ background: '#060f0a', color: '#7dd3b0' }}>{IRIS_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(IRIS_SQL); showToast('IRIS SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>
          </div>
        )}

        {/* ── SETUP ───────────────────────────────────────────────────── */}
        {tab === 'setup' && (
          <div className="p-8 max-w-2xl">
            <h1 className="text-[1.4rem] font-bold text-white mb-1">Setup</h1>
            <p className="text-[0.82rem] mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>One-time configuration steps</p>

            {/* Full migration — run everything at once */}
            <div className="rounded-2xl p-6 mb-6" style={{ background: '#0d1f17', border: '1.5px solid rgba(0,168,107,0.35)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🚀</span>
                <h3 className="font-bold text-white">Full Migration (Run Everything At Once)</h3>
              </div>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Idempotent — safe to run multiple times. Creates all tables, RPCs, policies, and triggers in one shot.
                Paste into <strong style={{ color: '#7dd3b0' }}>Supabase Dashboard → SQL Editor → New query</strong>.
              </p>
              <button
                onClick={() => { navigator.clipboard.writeText(FULL_MIGRATION_SQL); showToast('Full migration SQL copied ✓'); }}
                className="px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: '#00A86B', color: '#fff' }}
              >Copy Full Migration SQL</button>
            </div>

            <p className="text-[0.75rem] font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>— or run steps individually —</p>

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
              <h3 className="font-bold text-white mb-1">2. Create Featured Carousel Table</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Run this SQL to enable the spotlight carousel</p>
              <pre className="rounded-xl p-4 text-[0.72rem] leading-relaxed overflow-x-auto" style={{ background: '#0e1a14', color: '#7dd3b0' }}>{FEATURED_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(FEATURED_SQL); showToast('SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">3. Link Posts &amp; Stories to Users</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Adds a <code className="text-[#7dd3b0]">user_id</code> column to posts and stories so the gallery view and Ban+Remove cascade work correctly</p>
              <pre className="rounded-xl p-4 text-[0.72rem] leading-relaxed overflow-x-auto" style={{ background: '#0e1a14', color: '#7dd3b0' }}>{USER_LINK_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(USER_LINK_SQL); showToast('SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">3b. Create Usage Tracking Table</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Rolling-window table for audio plays and profile view limits</p>
              <pre className="rounded-xl p-4 text-[0.72rem] leading-relaxed overflow-x-auto" style={{ background: '#0e1a14', color: '#7dd3b0' }}>{USER_USAGE_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(USER_USAGE_SQL); showToast('SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">4. Enable Contact Credit System</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Connects the admin-set <code className="text-[#7dd3b0]">contact_credits</code> balance to the live app — each WhatsApp/Call deducts 1 credit permanently. New signups automatically receive 20 welcome credits. No hourly reset.
              </p>
              <pre className="rounded-xl p-4 text-[0.72rem] leading-relaxed overflow-x-auto" style={{ background: '#0e1a14', color: '#7dd3b0' }}>{CREDITS_SQL}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(CREDITS_SQL); showToast('SQL copied ✓'); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(0,168,107,0.12)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >Copy SQL</button>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">5. Set Environment Variables</h3>
              <p className="text-[0.8rem] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Add these in Vercel → Project → Settings → Environment Variables</p>
              <div className="space-y-2.5">
                {[
                  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase Dashboard → Project Settings → API → service_role key'],
                  ['ADMIN_EMAILS', 'Comma-separated admin emails e.g. you@email.com'],
                  ['IRIS_SECRET', 'Strong random secret — run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'],
                  ['NEXT_PUBLIC_IRIS_CLIENT_SEED', 'Client signing seed (default: ir_iris_v1_instarishta) — not secret'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-3" style={{ background: '#0e1a14' }}>
                    <p className="text-[0.72rem] font-mono font-bold" style={{ color: '#7dd3b0' }}>{k}</p>
                    <p className="text-[0.7rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ background: '#1a2820' }}>
              <h3 className="font-bold text-white mb-1">6. Security Notes</h3>
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
