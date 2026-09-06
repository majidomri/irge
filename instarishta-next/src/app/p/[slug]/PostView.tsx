import { resolveSlug, serverDb } from '@/lib/slug-resolve';
import { notFound }      from 'next/navigation';
import Image from '@/components/ui/SmartImage';
import ShareButton       from '@/components/ShareButton';
import ViewTracker       from '@/components/ViewTracker';
import CommentSection    from '@/components/CommentSection';

async function resolvePost(slug: string) {
  const db = serverDb();

  // Shared with the route's own lookup via cache(); see lib/slug-resolve.
  const nano = await resolveSlug(slug);
  if (!nano || nano.entity_type !== 'post') return null;

  const { data: post } = await db
    .from('ir_posts')
    .select('id, image, thumb, images, title, caption, likes, views, created_at, user_id, ir_channels(name, slug)')
    .eq('id', nano.entity_id)
    .maybeSingle();

  if (!post) return null;

  const { data: comments, count: commentCount } = await db
    .from('ir_comments')
    .select('id, author_name, chip_key, created_at', { count: 'exact' })
    .eq('entity_type', 'post')
    .eq('entity_id', post.id)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(200);

  // Get profile slug for the user who owns this post
  let profileSlug: string | null = null;
  if (post.user_id) {
    const { data: ps } = await db
      .from('ir_nano_ids')
      .select('slug')
      .eq('entity_type', 'profile')
      .eq('entity_id', post.user_id as string)
      .maybeSingle();
    profileSlug = ps?.slug ?? null;
  }

  return {
    post,
    // resolveSlug types these as nullable; the UI formats them as numbers.
    stats:       { views: nano.views ?? 0, shares: nano.shares ?? 0 },
    profileSlug,
    comments:     comments ?? [],
    commentCount: commentCount ?? 0,
  };
}

export default async function PostView({ slug }: { slug: string }) {
  const data = await resolvePost(slug);
  if (!data) return notFound();

  const { post, stats, profileSlug, comments, commentCount } = data;
  const cover: string | null = (post.thumb as string | null) ?? (post.image as string | null) ?? null;
  const images: string[] = ((post.images as string[] | null) ?? (post.image ? [post.image as string] : [])).filter(Boolean);

  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9' }}>
      <ViewTracker slug={slug} />

      {/* Header */}
      <div style={{ background: '#1E3932', padding: '20px 24px 16px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="https://instarishta.me" style={{ color: '#00C87A', fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>
            InstaRishta
          </a>
          <ShareButton slug={slug} entityType="post" onDark />
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px' }}>

        {/* Main image, or a text card when the post has no image (caption/audio-only) */}
        {cover ? (
          <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #F0ECE8', background: '#fff' }}>
            {/* contain, not cover: biodata images are tall documents and a
                3/4 cover crop cut 30-45% off them — same bug as the feed. */}
            <div style={{ position: 'relative', aspectRatio: '3/4', background: '#F0ECE8' }}>
              <Image
                src={cover}
                alt={(post.title ?? 'Profile post') as string}
                fill
                style={{ objectFit: 'contain' }}
                sizes="(max-width: 520px) 95vw, 520px"
                priority
              />
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 20, border: '1px solid #F0ECE8', background: '#1E3932', padding: 28 }}>
            {post.title && (
              <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
                {post.title as string}
              </h1>
            )}
            {post.caption && (
              <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                {post.caption as string}
              </p>
            )}
          </div>
        )}

        {/* Post info */}
        <div style={{ marginTop: 16, padding: '0 4px' }}>
          {cover && post.title && (
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#141413', lineHeight: 1.2 }}>
              {post.title as string}
            </h1>
          )}
          {cover && post.caption && (
            <p style={{ margin: 0, fontSize: 15, color: '#696969', lineHeight: 1.7 }}>
              {post.caption as string}
            </p>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, marginTop: 16, padding: '14px 0', borderTop: '1px solid #F0ECE8', borderBottom: '1px solid #F0ECE8' }}>
            {/* The entity total, not the per-slug one. ir_nano_ids.views counts
                only visits to THIS share link, so the same post read "8 views"
                in the app and "1 view" here. See migration 021. */}
            <span style={{ fontSize: 13, color: '#696969' }}>
              <strong style={{ color: '#141413', fontWeight: 700 }}>{((post.views as number) ?? 0).toLocaleString()}</strong> views
            </span>
            <span style={{ fontSize: 13, color: '#696969' }}>
              <strong style={{ color: '#141413', fontWeight: 700 }}>{(post.likes as number ?? 0).toLocaleString()}</strong> likes
            </span>
            <span style={{ fontSize: 13, color: '#696969' }}>
              <strong style={{ color: '#141413', fontWeight: 700 }}>{stats.shares.toLocaleString()}</strong> shares
            </span>
          </div>

          {/* Actions */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ShareButton slug={slug} entityType="post" label="Share this post" />
            {profileSlug && (
              <a href={`/p/${profileSlug}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 100,
                border: '1px solid #D1CDC7', background: '#fff',
                color: '#141413', fontSize: 13, fontWeight: 600,
                textDecoration: 'none', letterSpacing: '-0.2px',
              }}>
                View full profile
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Multi-image strip (if post has multiple images) */}
      {images.length > 1 && (
        <div style={{ maxWidth: 520, margin: '16px auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {images.map((img, i) => (
              <div key={i} style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '1px solid #F0ECE8' }}>
                <Image
                  src={img}
                  alt={`${(post.title ?? 'Rishta listing') as string} — image ${i + 1} of ${images.length}`}
                  width={80}
                  height={80}
                  style={{ objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div style={{ maxWidth: 520, margin: '8px auto 24px', padding: '20px 16px 0' }}>
        <CommentSection entityType="post" entityId={post.id as string} initialComments={comments} initialCount={commentCount} />
      </div>

      <div style={{ textAlign: 'center', padding: '32px 24px', color: '#B0A8A0', fontSize: 12 }}>
        <a href="https://instarishta.me" style={{ color: '#006241', textDecoration: 'none', fontWeight: 700 }}>
          instarishta.me
        </a>
        {' '}· Trusted Muslim Matrimony
      </div>
    </main>
  );
}
