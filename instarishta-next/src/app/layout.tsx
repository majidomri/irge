import type { Metadata } from 'next';
import './globals.css';
import SiteShell from '@/components/SiteShell';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://instarishta.com'),
  title: {
    default: 'InstaRishta — Trusted Muslim Matrimony & Nikah Matchmaking',
    template: '%s — InstaRishta',
  },
  description:
    'Find verified Muslim marriage proposals on InstaRishta. Trusted nikah matchmaking platform with family-controlled contact and verified profiles.',
  keywords: ['Muslim matrimony', 'nikah', 'rishta', 'Muslim marriage', 'halal matchmaking'],
  authors: [{ name: 'InstaRishta' }],
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    siteName: 'InstaRishta',
    type: 'website',
    images: [{ url: '/logo.svg', width: 512, height: 512, alt: 'InstaRishta' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SiteShell>{children}</SiteShell>
        </AuthProvider>
      </body>
    </html>
  );
}
