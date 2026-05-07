import { createClient } from '@supabase/supabase-js';
import { notFound }      from 'next/navigation';
import Image             from 'next/image';
import ShareButton       from '@/components/ShareButton';
import ViewTracker       from '@/components/ViewTracker';
import type { Metadata } from 'next';

async function resolvePost(slug: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, views, shares')
    .eq('slug', slug)
    .eq('entity_type', 'post')
    .maybeSingle();

  if (!nano) return null;

  const { data: post } = await db
    .from('ir_posts')
    .select('id, image, thumb, images, title, caption, likes, views, created_at, user_id, ir_channels(name, slug)')
    .eq('id', nano.entity_id)
    .maybeSingle();

  if (!post) return null;

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
    stats:       { views: nano.views, shares: nano.shares },
    profileSlug,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title:       `Post · instarishta.me/post/${slug}`,
    description: 'View this matrimony post on InstaRishta.',
  };
}

export default async function PostSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await resolvePost(slug);
  if (!data) return notFound();

  const { post, stats, profileSlug } = data;
  const images: string[] = (post.images as string[] | null) ?? [post.image as string];

  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9' }}>
      <ViewTracker slug={slug} />

      {/* Header */}
      <div style={{ background: '#1E3932', padding: '20px 24px 16px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="https://instarishta.me" style={{ color: '#00C87A', fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>
            InstaRishta
          </a>
          <ShareButton slug={slug} entityType="post" />
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px' }}>

        {/* Main image */}
        <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #F0ECE8', background: '#fff' }}>
          <div style={{ position: 'relative', aspectRatio: '3/4' }}>
            <Image
              src={(post.thumb ?? post.image) as string}
              alt={(post.title ?? 'Profile post') as string}
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 520px) 95vw, 520px"
              priority
            />
          </div>
        </div>

        {/* Post info */}
        <div style={{ marginTop: 16, padding: '0 4px' }}>
          {post.title && (
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#141413', lineHeight: 1.2 }}>
              {post.title as string}
            </h1>
          )}
          {post.caption && (
            <p style={{ margin: 0, fontSize: 15, color: '#696969', lineHeight: 1.7 }}>
              {post.caption as string}
            </p>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, marginTop: 16, padding: '14px 0', borderTop: '1px solid #F0ECE8', borderBottom: '1px solid #F0ECE8' }}>
            <span style={{ fontSize: 13, color: '#696969' }}>
              <strong style={{ color: '#141413', fontWeight: 700 }}>{stats.views.toLocaleString()}</strong> views
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
                <Image src={img} alt={`Photo ${i + 1}`} width={80} height={80} style={{ objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '32px 24px', color: '#B0A8A0', fontSize: 12 }}>
        <a href="https://instarishta.me" style={{ color: '#006241', textDecoration: 'none', fontWeight: 700 }}>
          instarishta.me
        </a>
        {' '}· Trusted Muslim Matrimony
      </div>
    </main>
  );
}
