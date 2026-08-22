import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; event?: string; source?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const { slug, event = 'view', source } = body;
  if (!slug || typeof slug !== 'string' || slug.length !== 13) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }
  if (!['view', 'share', 'referral'].includes(event)) {
    return NextResponse.json({ error: 'invalid event' }, { status: 400 });
  }

  const ip     = clientIp(req);
  const ipHash = createHash('sha256').update(ip + slug).digest('hex').slice(0, 16);
  const referer = req.headers.get('referer') ?? null;
  // Referer is client-controlled and unvalidated — a malformed value must
  // not 500 this public, unauthenticated endpoint.
  let refererHost: string | null = null;
  if (referer) {
    try { refererHost = new URL(referer).hostname; } catch { /* malformed referer, ignore */ }
  }
  const finalSource = source ?? refererHost;

  await adminClient().rpc('ir_record_event', {
    p_slug:       slug,
    p_event_type: event,
    p_source:     finalSource,
    p_ip_hash:    ipHash,
  });

  return NextResponse.json({ ok: true });
}
