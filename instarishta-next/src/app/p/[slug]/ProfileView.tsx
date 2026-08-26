import { createClient } from '@supabase/supabase-js';
import { notFound }      from 'next/navigation';
import Image             from 'next/image';
import ShareButton       from '@/components/ShareButton';
import ViewTracker       from '@/components/ViewTracker';
import ReportMemberButton from '@/components/ReportMemberButton';

// UUID is resolved server-side — never exposed in the URL or response
async function resolveProfile(slug: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, entity_type, views, shares')
    .eq('slug', slug)
    .eq('entity_type', 'profile')
    .maybeSingle();

  if (!nano) return null;

  // Posts by this user (UUID used internally, never sent to client)
  const { data: posts } = await db
    .from('ir_posts')
    .select('id, image, thumb, title, caption, likes, views, created_at, ir_channels(name, slug)')
    .eq('user_id', nano.entity_id)
    .order('created_at', { ascending: false })
    .limit(60);

  // Get the post slugs for sharing
  const postIds = (posts ?? []).map(p => p.id as string);
  const { data: postSlugs } = postIds.length
    ? await db
        .from('ir_nano_ids')
        .select('slug, entity_id')
        .eq('entity_type', 'post')
        .in('entity_id', postIds)
    : { data: [] };

  const slugMap = Object.fromEntries((postSlugs ?? []).map(r => [r.entity_id, r.slug]));

  return {
    stats: { views: nano.views, shares: nano.shares },
    posts: (posts ?? []).map(p => ({
      ...p,
      shareSlug: slugMap[p.id as string] ?? null,
    })),
  };
}

export default async function ProfileView({ slug }: { slug: string }) {
  const data = await resolveProfile(slug);
  if (!data) return notFound();

  const { stats, posts } = data;

  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9' }}>
      <ViewTracker slug={slug} />

      {/* Header */}
      <div style={{ background: '#1E3932', padding: '28px 24px 20px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            InstaRishta Profile
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 }}>
              instarishta.me/p/{slug}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ReportMemberButton slug={slug} />
              <ShareButton slug={slug} entityType="profile" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F0ECE8' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px 24px', display: 'flex', gap: 24 }}>
          <span style={{ fontSize: 13, color: '#696969' }}>
            <strong style={{ color: '#141413', fontWeight: 700 }}>{stats.views.toLocaleString()}</strong> views
          </span>
          <span style={{ fontSize: 13, color: '#696969' }}>
            <strong style={{ color: '#141413', fontWeight: 700 }}>{stats.shares.toLocaleString()}</strong> shares
          </span>
          <span style={{ fontSize: 13, color: '#696969' }}>
            <strong style={{ color: '#141413', fontWeight: 700 }}>{posts.length}</strong> posts
          </span>
        </div>
      </div>

      {/* Posts grid */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px' }}>
        {posts.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#B0A8A0', padding: '64px 0', fontSize: 15 }}>
            No posts yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {posts.map(post => {
              const cover = (post.thumb as string | null) ?? (post.image as string | null) ?? null;
              return (
              <div key={post.id as string} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #F0ECE8' }}>
                {cover ? (
                  <div style={{ position: 'relative', aspectRatio: '3/4', background: '#F0ECE8' }}>
                    <Image
                      src={cover}
                      alt={(post.title ?? 'Profile post') as string}
                      fill
                      style={{ objectFit: 'contain' }}
                      sizes="(max-width: 680px) 45vw, 220px"
                    />
                  </div>
                ) : (
                  <div style={{ aspectRatio: '3/4', background: '#1E3932', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', textAlign: 'center', lineHeight: 1.4 }}>
                      {(post.title as string) || (post.caption as string) || 'Post'}
                    </p>
                  </div>
                )}
                {cover && post.title && (
                  <div style={{ padding: '10px 12px 12px' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#141413', lineHeight: 1.4 }}>
                      {post.title as string}
                    </p>
                    {post.caption && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#696969', lineHeight: 1.5,
                                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {post.caption as string}
                      </p>
                    )}
                    {post.shareSlug && (
                      <div style={{ marginTop: 10 }}>
                        <ShareButton slug={post.shareSlug} entityType="post" size="sm" label="Share post" />
                      </div>
                    )}
                  </div>
                )}
                {!cover && post.shareSlug && (
                  <div style={{ padding: '10px 12px 12px' }}>
                    <ShareButton slug={post.shareSlug} entityType="post" size="sm" label="Share post" />
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 24px', color: '#B0A8A0', fontSize: 12 }}>
        <a href="https://instarishta.me" style={{ color: '#006241', textDecoration: 'none', fontWeight: 700 }}>
          instarishta.me
        </a>
        {' '}· Trusted Muslim Matrimony
      </div>
    </main>
  );
}
