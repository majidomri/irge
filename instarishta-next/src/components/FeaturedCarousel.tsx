'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
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
}: {
  placement: 'home' | 'channels' | 'profiles';
  label?: string;
}) {
  const [items, setItems] = useState<FeaturedItem[]>([]);

  useEffect(() => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    client
      .from('ir_featured')
      .select('id, title, description, image_url, link_url')
      .eq('active', true)
      .or(`placement.eq.all,placement.eq.${placement}`)
      .order('sort_order', { ascending: true })
      .limit(10)
      .then(({ data }) => {
        if (data && data.length > 0) setItems(data);
      });
  }, [placement]);

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
