'use client';
import { useEffect, useState } from 'react';
import { getAuthClient } from '@/lib/auth-client';
import dynamic from 'next/dynamic';

const Carousel = dynamic(() => import('@/components/ui/Carousel'), { ssr: false });

interface FeaturedItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
}

export default function FeaturedCarousel({
  placement,
  label = 'Featured Profiles',
  initialItems,
}: {
  placement: 'home' | 'channels' | 'profiles';
  label?: string;
  initialItems?: FeaturedItem[];
}) {
  const [items, setItems] = useState<FeaturedItem[]>(initialItems ?? []);

  useEffect(() => {
    if (initialItems && initialItems.length > 0) return; // server already fetched
    // Reuse the singleton browser client — creating a separate one here causes
    // "Multiple GoTrueClient instances detected" and fights getAuthClient() for
    // the auth-token lock, which surfaces as NavigatorLockAcquireTimeoutError
    // on every other auth-aware RPC (sign-out, contact unlocks, etc.).
    getAuthClient()
      .from('ir_featured')
      .select('id, title, description, image_url, link_url')
      .eq('active', true)
      .or(`placement.eq.all,placement.eq.${placement}`)
      .order('sort_order', { ascending: true })
      .limit(10)
      .then(({ data }) => {
        if (data && data.length > 0) setItems(data);
      });
  }, [placement, initialItems]);

  if (items.length === 0) return null;

  return (
    <section
      className="flex flex-col items-center py-8"
      style={{ background: '#1E3932' }}
    >
      <div className="flex items-center justify-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[rgba(255,255,255,0.6)] mb-6">
        <span className="block h-px w-5 rounded-full bg-current opacity-50" />
        {label}
        <span className="block h-px w-5 rounded-full bg-current opacity-50" />
      </div>
      <Carousel
        items={items.map(item => ({
          id: item.id,
          title: item.title,
          description: item.description ?? undefined,
          image_url: item.image_url ?? undefined,
          link_url: item.link_url ?? undefined,
        }))}
        baseWidth={320}
        cardHeight={360}
        autoplay
        autoplayDelay={4500}
        pauseOnHover
        loop
      />
    </section>
  );
}
