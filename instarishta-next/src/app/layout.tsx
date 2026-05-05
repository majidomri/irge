import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileDock from '@/components/MobileDock';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
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
          <Navbar />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <Footer />
          <MobileDock />
        </AuthProvider>
      </body>
    </html>
  );
}
