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
 * Every file is normalised on the way in (see lib/image-optimize.ts): EXIF
 * orientation applied and the rest of the metadata dropped, capped at 1920 on
 * the long edge, and re-encoded to whichever of AVIF / WebP / JPEG comes out
 * smallest. What arrives here is an admin's phone export -- 4000px and
 * several MB, with GPS in its EXIF -- and that is not what should live in the
 * bucket forever.
 *
 * Node runtime — the Supabase storage client needs it.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { optimizeUpload } from '@/lib/image-optimize';

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
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];   // avif | webp | png | jpg
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

  const raw = Buffer.from(await file.arrayBuffer());
  const image = await optimizeUpload(raw, file.type);

  // Addressed by the bytes we STORE, not the bytes we were given: two admins
  // exporting the same photo at different sizes should converge on one
  // object, and re-uploading an identical file must still be a no-op.
  const path = await objectName(
    image.bytes.buffer.slice(
      image.bytes.byteOffset,
      image.bytes.byteOffset + image.bytes.byteLength,
    ) as ArrayBuffer,
    image.mime,
  );

  const { error } = await db.storage.from(BUCKET).upload(path, image.bytes, {
    contentType: image.mime,
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
  return NextResponse.json({
    url: data.publicUrl,
    path,
    // The importer shows this, so an admin can see what the upload cost.
    width: image.width,
    height: image.height,
    bytes: image.bytes.byteLength,
    originalBytes: image.originalBytes,
    savedPct: image.savedPct,
    type: image.mime,
  });
});
