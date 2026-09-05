import { getDb } from './db';

// Reuse the singleton browser client — prevents "multiple GoTrueClient instances" warning
export const supabase = getDb();

// Defined in feed-constants.ts and re-exported here, so the server data path
// can share it without importing this module (which builds a browser client
// on import). Every existing `from '@/lib/supabase'` import keeps working.
import { POST_PAGE_SIZE } from './feed-constants';
export { POST_PAGE_SIZE };

// ── Channels ─────────────────────────────────────────────────────────────────

/**
 * Content channels only. Cohort rows (Doctors, CAs, …) live in the same
 * table since migration 015 but are a different concept — a member circle,
 * not a content feed — so every generic "list the channels" surface has to
 * exclude them or they crowd out the real channels by recency.
 */
export async function getChannels() {
  const { data, error } = await supabase
    .from('ir_channels')
    .select('*')
    .eq('is_cohort', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Every channel a reader can move to, cohorts included.
 *
 * `getChannels` leaves cohorts out because they would crowd the channels index
 * by recency. The strip above a feed wants the opposite: cohorts ARE the other
 * groups someone would swipe to, so they belong there. Ordered by name so the
 * strip does not reshuffle itself as posts arrive.
 */
export async function getBrowsableChannels() {
  const { data, error } = await supabase
    .from('ir_channels')
    .select('id, name, slug')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * The profession cohorts, with their published member counts — "412 verified
 * doctors". Ordered by size so the strongest circle leads.
 */
export async function getCohorts() {
  const { data, error } = await supabase
    .from('ir_channels')
    .select('slug, name, description, cover_image, profession_key, member_count')
    .eq('is_cohort', true)
    .order('member_count', { ascending: false });
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

/** How many posts the channel holds, for the viewer's counter. */
export async function countPosts(channelId: string): Promise<number> {
  const { count, error } = await supabase
    .from('ir_posts')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId);
  if (error) throw error;
  return count ?? 0;
}

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

export async function incrementStoryLikes(storyId: string) {
  await supabase.rpc('ir_increment_story_likes', { story_id: storyId });
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

// ── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeChannel(channelId: string, onInsert: (post: IPost) => void) {
  const ch = supabase
    .channel('ir_realtime_' + channelId + '_' + Date.now())
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public',
      table: 'ir_posts', filter: 'channel_id=eq.' + channelId,
    }, (payload: { new: IPost }) => onInsert(payload.new));
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
  user_id?: string;
  image?: string | null; // absent for text/audio-only posts
  thumb?: string;
  images?: string[];
  title?: string;
  caption?: string;
  audio_url?: string;
  likes?: number;
  views?: number;
  created_at: string;

  /**
   * Biodata facets (migration 024), present only on posts published from the
   * live show -- those are generated from the registry, so the values are
   * known. A WhatsApp import is a picture and knows none of them, so every
   * one of these is optional and `undefined` means "cannot answer", never
   * "no".
   */
  gender?: string | null;
  age?: number | null;
  community?: string | null;
  education?: string | null;
  marital?: string | null;
  state?: string | null;
  city?: string | null;
  country?: string | null;
  is_urgent?: boolean | null;
}

export interface IStory {
  id: string;
  channel_id: string;
  user_id?: string;
  image: string;
  likes?: number;
  created_at: string;
}
