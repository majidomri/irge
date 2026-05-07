import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// Call this from Cloudflare Worker whenever profiles are added/edited:
// POST /api/revalidate  with header  x-revalidate-secret: <REVALIDATE_SECRET>
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (secret && req.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  revalidatePath('/profiles');
  return NextResponse.json({ ok: true, revalidated: true, at: new Date().toISOString() });
}
