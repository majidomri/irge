import { createClient }     from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import Image from '@/components/ui/SmartImage';
import ShareButton            from '@/components/ShareButton';
import ViewTracker            from '@/components/ViewTracker';

async function resolveStory(slug: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, views, shares, created_at')
    .eq('slug', slug)
    .eq('entity_type', 'story')
    .maybeSingle();

  if (!nano) return null;

  // Stories expire after 24h
  const age = Date.now() - new Date(nano.created_at as string).getTime();
  if (age > 86_400_000) return 'expired';

  const { data: story } = await db
    .from('ir_stories')
    .select('id, image, created_at, channel_id')
    .eq('id', nano.entity_id)
    .maybeSingle();

  if (!story) return null;

  return { story, stats: { views: nano.views, shares: nano.shares } };
}

export default async function StorySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await resolveStory(slug);

  if (!data) return notFound();
  if (data === 'expired') redirect('/');

  const { story, stats } = data;

  return (
    <main style={{ minHeight: '100vh', background: '#141413', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ViewTracker slug={slug} />

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 420, padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://instarishta.me" style={{ color: '#00C87A', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>
          InstaRishta
        </a>
        <ShareButton slug={slug} entityType="story" />
      </div>

      {/* Story image */}
      <div style={{ width: '100%', maxWidth: 420, margin: '16px 0', padding: '0 20px' }}>
        <div style={{ borderRadius: 20, overflow: 'hidden', position: 'relative', aspectRatio: '9/16' }}>
          <Image
            src={story.image as string}
            alt="Story"
            fill
            style={{ objectFit: 'cover' }}
            sizes="420px"
            priority
          />
          {/* Stats overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '48px 16px 16px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                {stats.views.toLocaleString()} views
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                {stats.shares.toLocaleString()} shares
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', paddingBottom: 24 }}>
        <a href="https://instarishta.me" style={{ color: '#00C87A', textDecoration: 'none', fontWeight: 700 }}>
          instarishta.me
        </a>
        {' '}· Stories expire after 24 hours
      </div>
    </main>
  );
}
