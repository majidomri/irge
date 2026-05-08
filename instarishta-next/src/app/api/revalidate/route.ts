import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// POST /api/revalidate  +  header  x-revalidate-secret: <REVALIDATE_SECRET>
// Purges both unstable_cache tags so the next request re-fetches from origin.
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (secret && req.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  revalidateTag('profiles', {});
  revalidateTag('featured', {});
  return NextResponse.json({ ok: true, revalidated: ['profiles', 'featured'], at: new Date().toISOString() });
}
