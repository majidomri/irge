/**
 * /nizam — admin dashboard for content management.
 *
 * Two-layer auth:
 *   1. Middleware (src/middleware.ts) does a fast cookie-presence check
 *      and bounces anonymous users to / before any render.
 *   2. THIS server component does the full session load + ADMIN_EMAILS
 *      allowlist check. Non-admins also bounce to /.
 *
 * The actual UI lives in the client component below. We fetch the
 * initial channels list server-side so the dashboard opens with data
 * already populated.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth, isAdminEmail } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import NizamClient, { type Channel } from './NizamClient';

export const metadata = {
  title: 'Nizam — Admin',
  robots: { index: false, follow: false },
};

async function loadChannels(): Promise<Channel[]> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await db
    .from('ir_channels')
    .select('id, name, slug, description, cover_image, created_at, is_cohort')
    .order('created_at', { ascending: false });
  return (data as Channel[]) ?? [];
}

export default async function NizamPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/?signin=1&next=%2Fnizam');
  }
  if (!isAdminEmail(session.user.email)) {
    // Signed in but not on the allowlist — bounce home with no breadcrumbs.
    redirect('/');
  }

  const channels = await loadChannels();

  return (
    <NizamClient
      adminEmail={session.user.email}
      adminName={session.user.name}
      initialChannels={channels}
    />
  );
}
