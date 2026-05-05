import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export const POST_PAGE_SIZE = 9;

// ── Channels ─────────────────────────────────────────────────────────────────

export async function getChannels() {
  const { data, error } = await supabase
    .from('ir_channels')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getChannelBySlug(slug: string) {
  const { data, error } = await supabase
    .from('ir_channels')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createChannel(name: string, description: string, coverImage?: string) {
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const { data, error } = await supabase
    .from('ir_channels')
    .insert([{ name, slug, description, cover_image: coverImage ?? null }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Profiles (all posts across all channels, server-side) ────────────────────

export interface IProfileRow {
  id: string;
  channel_id: string;
  image: string;
  thumb?: string;
  title?: string;
  caption?: string;
  audio_url?: string;
  likes?: number;
  views?: number;
  created_at: string;
  ir_channels: { name: string; slug: string } | null;
}

export async function getAllProfiles(opts?: {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<IProfileRow[]> {
  const { search, category, limit = 60, offset = 0 } = opts ?? {};

  let query = supabase
    .from('ir_posts')
    .select('id, channel_id, image, thumb, title, caption, likes, views, created_at, ir_channels(name, slug)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as IProfileRow[];

  // client-side category filter (channel name keyword match)
  if (category) {
    const kw = category.toLowerCase();
    return rows.filter(r =>
      (r.ir_channels?.name ?? '').toLowerCase().includes(kw) ||
      (r.title ?? '').toLowerCase().includes(kw) ||
      (r.caption ?? '').toLowerCase().includes(kw)
    );
  }

  return rows;
}

export async function getProfilesCount(search?: string): Promise<number> {
  let query = supabase
    .from('ir_posts')
    .select('id', { count: 'exact', head: true });
  if (search) query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
  const { count } = await query;
  return count ?? 0;
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(channelId: string, page: number) {
  const from = page * POST_PAGE_SIZE;
  const { data, error } = await supabase
    .from('ir_posts')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .range(from, from + POST_PAGE_SIZE - 1);
  if (error) throw error;
  return data ?? [];
}

export async function incrementLikes(postId: string) {
  await supabase.rpc('ir_increment_likes', { post_id: postId });
}

export async function incrementViews(postId: string) {
  await supabase.rpc('ir_increment_views', { post_id: postId });
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from('ir_posts').delete().eq('id', postId);
  if (error) throw error;
}

// ── Stories ───────────────────────────────────────────────────────────────────

export async function getStories(channelId: string) {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('ir_stories')
    .select('*')
    .eq('channel_id', channelId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createStory(channelId: string, image: string) {
  const { data, error } = await supabase
    .from('ir_stories')
    .insert([{ channel_id: channelId, image }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStory(storyId: string) {
  const { error } = await supabase.from('ir_stories').delete().eq('id', storyId);
  if (error) throw error;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() { await supabase.auth.signOut(); }

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeChannel(channelId: string, onInsert: (post: IPost) => void) {
  const ch = supabase
    .channel('ir_realtime_' + channelId + '_' + Date.now())
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public',
      table: 'ir_posts', filter: 'channel_id=eq.' + channelId,
    }, (payload) => onInsert(payload.new as IPost));
  ch.subscribe();
  return ch;
}

export function unsubscribeChannel(ch: ReturnType<typeof supabase.channel>) {
  supabase.removeChannel(ch).catch(() => {});
}

// ── Types (co-located for convenience) ───────────────────────────────────────

export interface IChannel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cover_image?: string;
  created_at: string;
}

export interface IPost {
  id: string;
  channel_id: string;
  image: string;
  thumb?: string;
  images?: string[];
  title?: string;
  caption?: string;
  audio_url?: string;
  likes?: number;
  views?: number;
  created_at: string;
}

export interface IStory {
  id: string;
  channel_id: string;
  image: string;
  created_at: string;
}
