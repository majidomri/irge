'use client';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileDock from '@/components/MobileDock';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  // Admin panel gets no site chrome
  if (path.startsWith('/nizam')) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer />
      <MobileDock />
    </>
  );
}
