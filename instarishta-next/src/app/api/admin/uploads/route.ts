/**
 * POST /api/admin/uploads — multipart file → Supabase Storage → public URL.
 *
 * The rest of the app treats ir_posts.image / ir_stories.image as free text
 * and /nizam only ever pastes a URL, which is fine for content already hosted
 * somewhere. The WhatsApp importer starts from files on the admin's disk, so
 * it needs somewhere to put them first; this is that step, and it's generic
 * enough for the normal post form to adopt later.
 *
 * Uploads go through the service-role client rather than direct-from-browser
 * so the bucket needs no anon-insert policy — the only way in is an admin
 * session, already enforced by withAdmin.
 *
 * The bucket must exist and be public; its host is already allowlisted for
 * next/image in next.config.ts.
 *
 * Node runtime — the Supabase storage client needs it.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const runtime = 'nodejs';

const BUCKET = process.env.SUPABASE_UPLOAD_BUCKET || 'uploads';

// Matches what WhatsApp exports and what the feed can actually render.
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Content-addressed object names: the SHA-256 of the bytes, not the original
 * filename. WhatsApp export filenames (IMG-20240312-WA0007.jpg) collide
 * constantly across groups, and re-uploading identical bytes should land on
 * the same object rather than accumulating copies. Note this is byte-equality
 * only — the *perceptual* dedup that catches re-compressed forwards happens
 * client-side before we ever get here (see lib/phash.ts).
 */
async function objectName(bytes: ArrayBuffer, mime: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  // Shard by the first two hex chars — flat buckets with tens of thousands of
  // objects are painful to browse in the Supabase dashboard.
  return `imports/${hex.slice(0, 2)}/${hex}.${ext}`;
}

export const POST = withAdmin(async (req, { db }) => {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type || 'unknown'}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 8MB)' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const path  = await objectName(bytes, file.type);

  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    // Same bytes → same path, so a repeat upload is a no-op overwrite rather
    // than a "Duplicate" error that would fail an otherwise-fine import.
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) {
    console.error('[uploads]', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
});
