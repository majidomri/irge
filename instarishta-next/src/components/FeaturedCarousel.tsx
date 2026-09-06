'use client';
import { useEffect, useState } from 'react';
import { restSelect } from '@/lib/supabase-rest';
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
    // A plain PostgREST GET. getDb() built a full @supabase/ssr browser
    // client for this one select, and because this carousel renders on /,
    // /profiles and /channels/[slug], that put supabase-js — realtime, auth
    // and a Buffer polyfill — into the first load of all three.
    restSelect<FeaturedItem>('ir_featured', {
      select: 'id,title,description,image_url,link_url',
      active: 'eq.true',
      or: `(placement.eq.all,placement.eq.${placement})`,
      order: 'sort_order.asc',
      limit: 10,
    }).then((data) => {
      if (data.length > 0) setItems(data);
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
