import type { Metadata } from 'next';

/**
 * Metadata for /account and /account/devices.
 *
 * Private pages: a signed-out crawler sees an empty shell, which is thin
 * duplicate content and should never have been indexable. robots.txt does not
 * cover it — its rules are per-crawler Allow/Disallow, and Googlebot is
 * allowed everything — so the noindex has to be stated here.
 *
 * Metadata only. The redirect is in proxy.ts, which knows the pathname and so
 * can send the visitor back to the page they actually asked for.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
