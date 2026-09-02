import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/post-image/[slug] → redirect to that post's own image.
 *
 * The profiles popup used /api/share-card for this, which was wrong twice
 * over. That route RENDERS a card -- photo, QR, brand line -- for forwarding
 * into WhatsApp, so it put a QR in front of someone already on the site. And
 * it caches for a day at the edge keyed on the slug, so re-pointing a slug at
 * a different post kept serving the old picture until the cache aged out.
 *
 * This returns the post's stored image instead. Storage URLs are
 * content-addressed, so the picture itself caches for as long as anyone likes
 * while this lookup stays uncached and always reflects where the slug points
 * right now.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, entity_type')
    .eq('slug', slug)
    .maybeSingle();

  if (!nano) return new NextResponse('Not found', { status: 404 });

  const table = nano.entity_type === 'story' ? 'ir_stories' : 'ir_posts';
  const { data: row } = await db
    .from(table)
    .select('image')
    .eq('id', nano.entity_id)
    .maybeSingle();

  const image = (row as { image?: string } | null)?.image;
  if (!image) return new NextResponse('No image', { status: 404 });

  return NextResponse.redirect(image, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
