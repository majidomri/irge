'use client';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileDock from '@/components/MobileDock';
import PhoneNudge from '@/components/PhoneNudge';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  // Admin panel gets no site chrome
  if (path.startsWith('/nizam')) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      {/* Sits under the navbar so it reads as part of the chrome, not as page
          content. Renders nothing unless a signed-in member still has no
          verified number — see PhoneNudge for why it nags but never blocks. */}
      <PhoneNudge />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer />
      <MobileDock />
    </>
  );
}
