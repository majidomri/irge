import ProfilesClient from './ProfilesClient';
import type { Profile } from './ProfilesClient';

export const metadata = {
  title: 'Browse Profiles – InstaRishta Muslim Matrimony',
  description:
    'Browse 500+ verified Muslim rishta profiles. Filter by gender, education, marital status. Contact via WhatsApp.',
};

// Revalidate cached profiles every 30 minutes; on-demand via /api/revalidate
export const revalidate = 1800;

const WORKER_URL = 'https://instarishta-profile-relay.instarishtalead.workers.dev/api/profiles';

async function fetchProfiles(): Promise<Profile[]> {
  try {
    const res = await fetch(WORKER_URL, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Profile[]) : [];
  } catch {
    return [];
  }
}

export default async function ProfilesPage() {
  const initialProfiles = await fetchProfiles();
  return <ProfilesClient initialProfiles={initialProfiles} />;
}
