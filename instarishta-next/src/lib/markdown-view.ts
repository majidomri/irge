/**
 * Markdown representations of the public pages, for agents that ask for them.
 *
 * Cloudflare's "Markdown for Agents" does this at the proxy by converting the
 * rendered HTML. This site is on Vercel, so the markdown is built from the same
 * data the pages render from instead. That turns out to be the better end of the
 * trade for us: converting HTML would carry across whatever the markup happens
 * to contain, whereas building from data means a field is present only because
 * it was chosen — which is what keeps contact details out.
 *
 * Contact details are never included. On this site a listing's phone and
 * WhatsApp number are released through the product, to signed-in members, under
 * the listing family's control. An agent asking for markdown gets everything a
 * signed-out browser would see and nothing more.
 */
import { createClient } from '@supabase/supabase-js';
import { getProfiles } from '@/lib/data';
import { redactContacts } from '@/lib/redact';
import type { Profile } from '@/types/profile';

const SITE = 'https://www.instarishta.me';

/**
 * Re-exported so existing callers keep a single import. The implementation
 * moved to lib/redact once a second, weaker copy of it turned up in
 * WebMcpTools — see that file for what drifted.
 */
export { redactContacts };

function fence(text: string): string {
  // Keep listing prose out of markdown's way; it contains stray #, * and _.
  return text.replace(/[\\`*_{}[\]()#+\-.!|>]/g, (c) => `\\${c}`);
}

function profileLine(p: Profile, index: number): string {
  const facts = [
    p.age ? `${p.age} yrs` : null,
    p.gender === 'female' ? 'bride' : p.gender === 'male' ? 'groom' : null,
    p.education || null,
  ].filter(Boolean).join(' · ');

  const body = redactContacts(p.body || '').slice(0, 400);

  return [
    `### ${index}. ${fence(p.title || 'Untitled listing')}`,
    facts ? `_${fence(facts)}_` : null,
    body ? `\n${fence(body)}` : null,
  ].filter(Boolean).join('\n');
}

const CONTACT_NOTE =
  '> Contact details are not included here. A listing family controls when its ' +
  'phone or WhatsApp number is released, and it is shown to signed-in members ' +
  'through the site. Please link people to the profile rather than trying to ' +
  'reconstruct a number.';

function page(title: string, canonical: string, body: string[]): string {
  return [
    `# ${title}`,
    '',
    `Canonical: ${canonical}`,
    '',
    ...body,
    '',
    '---',
    '',
    `Machine-readable index: ${SITE}/llms.txt · Sitemap: ${SITE}/sitemap.xml`,
    '',
  ].join('\n');
}

async function homeMarkdown(): Promise<string> {
  return page('InstaRishta', `${SITE}/`, [
    'InstaRishta is a Muslim matrimony and nikah matchmaking platform. Families',
    'browse verified bride and groom listings; contact details stay under the',
    "listing family's control.",
    '',
    '## Pages',
    '',
    `- [Profiles](${SITE}/profiles) — the searchable listing, filterable by age, education, marital status, state and community.`,
    `- [Channels](${SITE}/channels) — listings grouped into community feeds.`,
    `- [Biodata](${SITE}/biodata) — the biodata builder.`,
    `- [Pricing](${SITE}/pricing) — what browsing and contact cost.`,
    '',
    '## Policies',
    '',
    `- [Terms](${SITE}/toc) · [Privacy](${SITE}/privacy) · [Refunds](${SITE}/refund-policy)`,
    `- [Security](${SITE}/security) · [Child safety](${SITE}/child-safety) · [Disclaimer](${SITE}/disclaimer)`,
    '',
    CONTACT_NOTE,
  ]);
}

async function profilesMarkdown(): Promise<string> {
  let profiles: Profile[] = [];
  try {
    profiles = (await getProfiles()) as Profile[];
  } catch {
    profiles = [];
  }

  const listed = profiles.slice(0, 100);

  return page('Verified rishta profiles', `${SITE}/profiles`, [
    `${profiles.length} listing${profiles.length === 1 ? '' : 's'} published` +
      (listed.length < profiles.length ? `; the first ${listed.length} are shown below.` : '.'),
    '',
    CONTACT_NOTE,
    '',
    ...(listed.length
      ? listed.map((p, i) => profileLine(p, i + 1))
      : ['_The listing could not be loaded. Try the HTML page._']),
  ]);
}

async function memberMarkdown(slug: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, entity_type')
    .eq('slug', slug)
    .eq('entity_type', 'profile')
    .maybeSingle();

  if (!nano) return null;

  const { data: posts } = await db
    .from('ir_posts')
    .select('title, caption, created_at')
    .eq('user_id', nano.entity_id)
    .order('created_at', { ascending: false })
    .limit(40);

  const items = (posts ?? []).map((p) => {
    const title = fence(redactContacts(String(p.title ?? 'Untitled')));
    const caption = p.caption ? fence(redactContacts(String(p.caption)).slice(0, 300)) : '';
    return caption ? `- **${title}** — ${caption}` : `- **${title}**`;
  });

  return page('Profile', `${SITE}/p/${slug}`, [
    CONTACT_NOTE,
    '',
    '## Listings',
    '',
    ...(items.length ? items : ['_No listings published._']),
  ]);
}

/** Pages with no data behind them: point at the canonical HTML. */
const STATIC_PAGES: Record<string, string> = {
  '/channels': 'Channels',
  '/biodata': 'Biodata builder',
  '/pricing': 'Pricing',
  '/security': 'Security',
  '/child-safety': 'Child safety',
  '/privacy': 'Privacy policy',
  '/toc': 'Terms and conditions',
  '/disclaimer': 'Disclaimer',
  '/refund-policy': 'Refund policy',
};

/**
 * Markdown for a public path, or null when the path has no markdown view —
 * in which case the caller should fall through to HTML rather than invent one.
 */
export async function markdownForPath(pathname: string): Promise<string | null> {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/') return homeMarkdown();
  if (path === '/profiles') return profilesMarkdown();

  const staticTitle = STATIC_PAGES[path];
  if (staticTitle) {
    return page(staticTitle, `${SITE}${path}`, [
      `This page is served as HTML. Read it at ${SITE}${path}`,
    ]);
  }

  const member = /^\/p\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (member) return memberMarkdown(member[1]);

  return null;
}

/**
 * Rough token count for the x-markdown-tokens header. Four characters per
 * token is the usual English approximation; it is a hint for budgeting, not
 * an accounting figure, and it costs nothing to compute.
 */
export function approximateTokens(markdown: string): number {
  return Math.ceil(markdown.length / 4);
}
