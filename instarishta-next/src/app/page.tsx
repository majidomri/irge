'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import StarBorder from '@/components/ui/StarBorder';
const Masonry = dynamic(() => import('@/components/ui/Masonry'), { ssr: false });
import FeaturedCarousel from '@/components/FeaturedCarousel';

type Channel = { slug: string; name: string; description: string | null; cover_image: string | null };

const FAQS = [
  { id: 1, q: 'How do I find a Muslim rishta online?', a: "Use InstaRishta's smart filters to search by education, location, age, height, sect, and profile type. All profiles are verified before going live — giving you genuine rishta proposals only." },
  { id: 2, q: 'Is InstaRishta safe for marriage proposals?', a: 'Yes. InstaRishta supports transparent profile browsing with controlled contact flow, verified badges, and family-first contact options. There is no direct private messaging — all contact is through family or wali.' },
  { id: 3, q: 'How does nikah matchmaking work on InstaRishta?', a: 'Browse profiles, apply filters, review biodata, and connect through the contact details provided — phone, WhatsApp, or family representative. Every step is transparent and family-approved.' },
  { id: 4, q: 'What does "family-controlled contact" mean?', a: 'Family-controlled contact means the profile prefers a guardian or wali to initiate contact before private details are shared. This is an Islamic-first approach that protects both parties.' },
  { id: 5, q: 'Is InstaRishta free to use?', a: 'Yes — browsing all profiles on InstaRishta is completely free. You can also submit your BioData through our secure private submission form.' },
  { id: 6, q: 'Can I post a rishta proposal for my family member?', a: 'Absolutely. Many profiles are posted by parents, siblings, or guardians on behalf of the candidate. This is fully supported and encouraged on InstaRishta.' },
];

const COMMUNITIES = [
  { emoji: '🕌', title: 'Sunni Profiles',       sub: "Hanafi · Shafi'i · Maliki · Hanbali" },
  { emoji: '📿', title: 'Hyderabadi Rishte',     sub: 'Local proposals from Hyderabad city' },
  { emoji: '👩‍⚕️', title: 'Educated Profiles',    sub: 'Doctors · Engineers · MBA · PhD' },
  { emoji: '📖', title: 'Hafiz & Alim',           sub: 'Islamic scholars & Quran Hafiz' },
  { emoji: '🌍', title: 'NRI & Diaspora',         sub: 'UAE · UK · USA · Canada & more' },
  { emoji: '💼', title: 'Divorcees & Widows',     sub: 'Respectful & judgment-free space' },
  { emoji: '⚡', title: 'Urgent Proposals',       sub: 'Seeking Nikah within 3–6 months' },
  { emoji: '🤲', title: 'Reverts to Islam',       sub: 'Welcoming revert Muslims worldwide' },
];

function TestimonialCard({ bg, color, initials, name, city, quote }: {
  bg: string; color: string; initials: string; name: string; city: string; quote: string;
}) {
  return (
    <div className="relative w-full h-full p-6 border border-[rgba(0,0,0,.06)]" style={{ background: bg, borderRadius: 12 }}>
      <div className="absolute top-1 left-4 text-[4rem] opacity-10 leading-none select-none" style={{ color }}>{'"'}</div>
      <div className="text-[#00754A] text-sm mb-2">★★★★★</div>
      <p className="relative z-[1] text-[0.875rem] text-[rgba(0,0,0,0.82)] leading-[1.55] mb-4">{quote}</p>
      <div className="flex items-center gap-2.5 mt-auto">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: color }}>{initials}</div>
        <div>
          <div className="text-[0.82rem] font-bold text-[rgba(0,0,0,0.87)]">{name}</div>
          <div className="text-[0.72rem] text-[rgba(0,0,0,0.52)]">{city}</div>
        </div>
        <div className="ml-auto text-[0.65rem] text-[#006241] font-bold bg-[rgba(0,98,65,.06)] rounded-full px-2 py-0.5 border border-[rgba(0,98,65,.15)] whitespace-nowrap">✓ Verified</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const channelsSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = channelsSectionRef.current;
    if (!section) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        obs.disconnect();
        loadChannels();
      }
    }, { rootMargin: '400px' });
    obs.observe(section);
    return () => obs.disconnect();
  }, []);

  async function loadChannels() {
    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await client
        .from('ir_channels')
        .select('slug, name, description, cover_image')
        .order('created_at', { ascending: false })
        .limit(8);
      setChannels(data ?? []);
    } catch {
      setChannels([]);
    }
  }

  return (
    <>
      {/* ── Ticker strip ── */}
      <div
        className="bg-[#1E3932] text-[rgba(255,255,255,.75)] text-[0.72rem] tracking-[0.08em] uppercase overflow-hidden h-[34px] flex items-center"
        aria-hidden="true"
      >
        <div className="flex gap-12 whitespace-nowrap animate-[ticker_28s_linear_infinite]">
          <span className="text-white/70">🌙 Verified Muslim Profiles</span><span>|</span>
          <span className="text-white/70">✅ Wali &amp; Family Approved Contact</span><span>|</span>
          <span className="text-white/70">🔒 Private &amp; Secure</span><span>|</span>
          <span className="text-white/70">⭐ 500+ Active Proposals</span><span>|</span>
          <span className="text-white/70">📍 Hyderabad · India · Global</span><span>|</span>
          <span className="text-white/70">🌙 Verified Muslim Profiles</span><span>|</span>
          <span className="text-white/70">✅ Wali &amp; Family Approved Contact</span><span>|</span>
          <span className="text-white/70">🔒 Private &amp; Secure</span><span>|</span>
          <span className="text-white/70">⭐ 500+ Active Proposals</span><span>|</span>
          <span className="text-white/70">📍 Hyderabad · India · Global</span>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden min-h-screen flex items-center bg-[#006241]" aria-labelledby="hero-heading">
        {/* Prism WebGL background */}
        <div className="absolute inset-0 z-[1] pointer-events-none" aria-hidden="true">
        </div>

        <div className="absolute -top-[20%] -right-[10%] w-[800px] h-[800px] pointer-events-none" aria-hidden="true"
          style={{ background: 'radial-gradient(circle, rgba(0,117,74,.25) 0%, transparent 68%)' }} />
        <div className="absolute -bottom-[10%] -left-[5%] w-[600px] h-[600px] pointer-events-none" aria-hidden="true"
          style={{ background: 'radial-gradient(circle, rgba(43,81,72,.30) 0%, transparent 68%)' }} />
        <div className="absolute top-[6%] right-[5%] opacity-[.12] pointer-events-none animate-[float_8s_ease-in-out_infinite]" aria-hidden="true">
          <svg width="260" height="260" viewBox="0 0 200 200" fill="none">
            <path d="M100 20 A80 80 0 1 0 100 180 A60 60 0 1 1 100 20Z" fill="white" />
            <circle cx="145" cy="55" r="12" fill="white" />
          </svg>
        </div>

        <div className="max-w-[1280px] mx-auto px-8 py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative z-[2]">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-[0.78rem] font-medium uppercase tracking-[0.06em] text-white/80 mb-3">
              <span className="w-[6px] h-[6px] rounded-full bg-[#00C87A] animate-pulse" />
              🌙 Muslim Matrimony Platform
            </div>

            <div className="font-arab text-[1.5rem] text-[#cba258] tracking-[0.04em] mt-1 mb-2">
              بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
            </div>

            <h1 id="hero-heading" className="text-white leading-[1.22] tracking-[-0.02em] text-[clamp(2.25rem,5vw,3.25rem)] font-bold mb-5">
              Find Your{' '}
              <span className="block" style={{ color: 'rgba(255,255,255,0.70)' }}>Halal Match,</span>
              Begin Your Nikah Journey.
            </h1>

            <p className="text-[rgba(255,255,255,0.70)] text-[1rem] leading-[1.5] max-w-[520px] mb-8">
              InstaRishta connects serious Muslim men and women seeking marriage proposals the right way — with
              verified profiles, Wali approval, and family-first contact. No dating. No noise. Just Rishta.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-8">
              <StarBorder as="div" color="#00C87A" speed="4s" thickness={2} className="rounded-full">
                <Link href="/profiles" className="inline-flex items-center gap-2 no-underline text-white font-bold text-[0.9rem]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  Browse All Profiles
                </Link>
              </StarBorder>
              <Link href="/biodata" className="btn-ghost inline-flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Post Your Profile
              </Link>
              <Link href="/pricing" className="inline-flex items-center gap-1.5 text-[rgba(255,255,255,0.65)] text-[0.82rem] font-medium hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                View Plans &amp; Pricing
              </Link>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex -space-x-2" aria-hidden="true">
                <span className="w-8 h-8 rounded-full border-2 border-[#006241] bg-[#00754A] flex items-center justify-center text-[0.75rem] font-semibold text-white">AM</span>
                <span className="w-8 h-8 rounded-full border-2 border-[#006241] bg-[#2b5148] flex items-center justify-center text-[0.75rem] font-semibold text-white">FZ</span>
                <span className="w-8 h-8 rounded-full border-2 border-[#006241] bg-white text-[#006241] flex items-center justify-center text-[0.75rem] font-semibold">NK</span>
                <span className="w-8 h-8 rounded-full border-2 border-[#006241] bg-[#1E3932] flex items-center justify-center text-[0.75rem] font-semibold text-white">SR</span>
              </div>
              <div className="text-white/70 text-[0.82rem] leading-tight">
                <strong className="block text-white/90">500+ Active Proposals</strong>
                Trusted by Muslim families across India &amp; globally
              </div>
            </div>

            <div className="chip-row">
              <Link href="/profiles?gender=bride"       className="chip">Bride Profiles</Link>
              <Link href="/profiles?gender=groom"       className="chip">Groom Profiles</Link>
              <Link href="/profiles?location=hyderabad" className="chip">Hyderabadi</Link>
              <Link href="/profiles?type=urgent"        className="chip">Urgent Nikah</Link>
              <Link href="/profiles?type=hafiz"         className="chip">Hafiz &amp; Alim</Link>
              <Link href="/profiles?location=nri"       className="chip">NRI Diaspora</Link>
            </div>
          </div>

          {/* Right — profile cards (desktop only) */}
          <div className="hidden md:block" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3">
              <HeroCard initials="AH" name="Ahmed H."  meta="27 · Hyderabad" color="#006241" tags={['Engineer', 'Sunni', "5'10\""]} />
              <HeroCard initials="FZ" name="Fatima Z." meta="24 · Bangalore" color="#00754A" tags={['Doctor', 'Wali Present', "5'4\""]} />
              {/* Stats */}
              <div className="rounded-[12px] p-4 col-span-2 bg-white/5 border border-white/10 backdrop-blur-[8px]">
                <div className="flex items-center justify-between gap-4">
                  {[['500+','Active Ads'],['144','Groom Profiles'],['356','Bride Profiles'],['100%','Muslim Only']].map(([num,lbl]) => (
                    <div key={lbl} className="text-center flex-1">
                      <strong className="block font-bold text-[1.4rem] text-white">{num}</strong>
                      <span className="block text-[0.7rem] text-white/70 tracking-[0.05em] uppercase">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>
              <HeroCard initials="NK" name="Nadia K."  meta="26 · Mumbai" color="#2b5148" tags={['MBA', "Shafi'i", 'Urgent']} />
              <HeroCard initials="SR" name="Sohail R." meta="30 · Pune"   color="#1E3932" tags={['IT', 'Hanafi', "5'11\""]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Profiles Carousel ── */}
      <FeaturedCarousel placement="home" label="Spotlight Profiles" />

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ background: '#f2f0eb' }} aria-labelledby="how-heading">
        <div className="max-w-[1280px] mx-auto px-8 py-20">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[#006241] mb-4">
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
              Simple Process
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
            </div>
            <h2 id="how-heading" className="text-[clamp(2rem,4vw,2.25rem)] font-bold text-[rgba(0,0,0,0.87)] leading-[1.22] tracking-[-0.02em] mb-4">How InstaRishta Works</h2>
            <p className="text-[1rem] text-[rgba(0,0,0,0.58)] max-w-[560px] leading-[1.5] mx-auto">
              A halal, family-approved process — transparent, safe, and Islamically guided from first look to Nikah.
            </p>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-[36px] left-[16.67%] right-[16.67%] h-[1px] bg-[rgba(0,0,0,0.12)] z-0" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-[1]">
              {[
                { emoji: '🔍', title: 'Browse Verified Profiles', desc: 'Filter by age, education, location, sect, and more. All profiles are reviewed before going live.' },
                { emoji: '💬', title: "Connect with Wali's Consent", desc: 'Reach out via provided contact — family-controlled and guardian-first. No direct private chat. Just halal communication.' },
                { emoji: '🤝', title: 'Begin Your Nikah Journey', desc: 'After meeting families and making istikhara, proceed to nikah with confidence. May Allah bless your union.' },
              ].map((s) => (
                <div key={s.title} className="text-center group">
                  <div className="w-[72px] h-[72px] rounded-full bg-white border-2 border-[#006241] flex items-center justify-center mx-auto mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:bg-[#1E3932] group-hover:border-transparent">
                    <span className="text-[1.8rem]">{s.emoji}</span>
                  </div>
                  <h3 className="text-[1.25rem] font-bold text-[rgba(0,0,0,0.87)] mb-2">{s.title}</h3>
                  <p className="text-[0.9rem] text-[rgba(0,0,0,0.58)] leading-[1.5] max-w-[280px] mx-auto">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Us ── */}
      <section id="why-us" className="relative overflow-hidden bg-[#1E3932]" aria-labelledby="why-heading">
        <div className="max-w-[1280px] mx-auto px-8 py-24 relative z-[1] grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
          {/* Left */}
          <div>
            <div className="flex items-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[rgba(255,255,255,0.70)] mb-4">
              <span className="block h-px w-5 rounded-full bg-current opacity-[0.5]" />
              Why Us
            </div>
            <h2 id="why-heading" className="text-white text-[clamp(2rem,4vw,2.25rem)] font-bold leading-[1.22] tracking-[-0.02em] mb-4">
              Not Just Another<br />
              <span style={{ color: 'rgba(255,255,255,0.70)' }}>Matrimony Site.</span>
            </h2>
            <p className="text-[rgba(255,255,255,0.70)] max-w-[420px] leading-[1.5]">
              While Shaadi.com and Jeevansathi.com serve all religions and dilute the Muslim experience,
              InstaRishta is built exclusively for the Muslim Ummah — with Islamic values at its core.
            </p>
            <div className="mt-10 flex flex-col gap-6">
              {[
                { emoji: '🌙', title: 'Muslim-Only Platform',          desc: 'Every profile is from a Muslim individual or family. No cross-religion noise — just serious Rishta seekers.' },
                { emoji: '🛡️', title: 'Wali & Family-First Contact',   desc: 'Profiles support guardian-controlled contact, honouring the Islamic principle of wali in marriage.' },
                { emoji: '✅', title: 'Verified Badges & Real Profiles', desc: 'Manual review before publishing. Verified badges on profiles that pass our checks.' },
                { emoji: '🔒', title: 'Private & No Dating Culture',    desc: 'InstaRishta is strictly for serious Nikah proposals. Zero casual dating or swipe culture.' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-[8px] bg-white/10 border border-white/20 flex items-center justify-center text-base flex-shrink-0">{item.emoji}</div>
                  <div>
                    <h4 className="text-white text-[0.95rem] font-bold mb-1">{item.title}</h4>
                    <p className="text-[rgba(255,255,255,0.70)] text-[0.83rem] leading-[1.5]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Right */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { emoji: '🎯', title: 'Sect & Maslak Filters',   desc: 'Filter by Sunni, Shia, Deobandi, Barelvi, Ahl-e-Hadith and more — something no generic site offers.', badge: 'Exclusive' },
              { emoji: '📖', title: 'Hafiz & Alim Profiles',   desc: 'Dedicated profiles for those with Islamic education — from Hafiz-e-Quran to qualified Ulama.', badge: 'Unique' },
              { emoji: '🌍', title: 'India & Global Diaspora', desc: 'Profiles from Hyderabad, Mumbai, Delhi, and the global Muslim diaspora — UAE, UK, USA & beyond.', badge: 'Worldwide' },
              { emoji: '⚡', title: 'Urgent Proposals Tagged', desc: 'Urgent marriage seekers are clearly tagged — no guessing, no delays when time matters.', badge: 'Speed' },
            ].map((c) => (
              <div key={c.title} className="rounded-[12px] p-6 bg-white/5 border border-white/10 transition-transform duration-300 hover:-translate-y-1 hover:bg-white/10">
                <div className="text-[1.75rem] mb-3">{c.emoji}</div>
                <h4 className="text-white text-[0.95rem] font-bold mb-1">{c.title}</h4>
                <p className="text-[rgba(255,255,255,0.70)] text-[0.8rem] leading-[1.5]">{c.desc}</p>
                <div className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold tracking-[0.05em] text-[#00C87A] bg-[rgba(34,200,122,.15)] border border-[rgba(34,200,122,.25)] uppercase">{c.badge}</div>
              </div>
            ))}
            <div className="col-span-2 rounded-[12px] p-6 bg-white/5 border border-white/10 transition-transform duration-300 hover:-translate-y-1 hover:bg-white/10">
              <div className="text-[1.75rem] mb-3">🤲</div>
              <h4 className="text-white text-[0.95rem] font-bold mb-1">Built with Islamic Values — Free to Browse</h4>
              <p className="text-[rgba(255,255,255,0.70)] text-[0.8rem] leading-[1.5]">
                No subscription trap. Browse all verified profiles completely free. Post your profile through our safe,
                private submission process. Because finding your halal match shouldn't have a paywall.
              </p>
              <div className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold tracking-[0.05em] text-[#00C87A] bg-[rgba(34,200,122,.15)] border border-[rgba(34,200,122,.25)] uppercase">Free to Browse</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Communities ── */}
      <section id="communities" style={{ background: '#edebe9' }} aria-labelledby="comm-heading">
        <div className="max-w-[1280px] mx-auto px-8 py-24">
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[#006241] mb-4">
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
              Communities
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
            </div>
            <h2 id="comm-heading" className="text-[clamp(2rem,4vw,2.25rem)] font-bold text-[rgba(0,0,0,0.87)] leading-[1.22] tracking-[-0.02em] mb-4">
              Proposals Across Every<br />Muslim Community
            </h2>
            <p className="text-[1rem] text-[rgba(0,0,0,0.58)] max-w-[560px] leading-[1.5] mx-auto">
              Browse profiles by your community, sect, or location. InstaRishta serves the entire Muslim Ummah — no one is left behind.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {COMMUNITIES.map((c) => (
              <Link key={c.title} href="/profiles"
                className="block text-center rounded-[12px] border border-[rgba(0,0,0,.06)] bg-white p-6 transition-all hover:-translate-y-1 hover:border-[#006241] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] no-underline">
                <span className="block text-[2rem] mb-3">{c.emoji}</span>
                <div className="text-[0.95rem] font-bold text-[rgba(0,0,0,0.87)] mb-1">{c.title}</div>
                <div className="text-[0.78rem] text-[rgba(0,0,0,0.58)]">{c.sub}</div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/profiles" className="btn-primary inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              View All Profiles &amp; Search Now
            </Link>
          </div>
        </div>
      </section>

      {/* ── Channels ── */}
      <section id="channels" ref={channelsSectionRef} className="bg-[#1E3932] py-20 overflow-hidden" aria-labelledby="channels-heading">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10">
            <div>
              <div className="flex items-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[rgba(255,255,255,0.70)] mb-3">
                <span className="block h-px w-5 rounded-full bg-current opacity-[0.5]" />
                Live Profile Channels
              </div>
              <h2 id="channels-heading" className="text-[clamp(2rem,4vw,2.25rem)] font-bold tracking-[-0.02em] text-white leading-[1.22]">Browse by Channel</h2>
              <p className="text-[rgba(255,255,255,0.70)] mt-3 max-w-[480px] text-[1rem] leading-[1.5]">
                Follow curated profile channels by city or community — updated in real-time, like WhatsApp channels.
              </p>
            </div>
            <Link href="/channels"
              className="inline-flex items-center gap-2 text-[0.875rem] font-semibold no-underline px-5 py-2.5 rounded-full border border-white/25 text-white hover:bg-white/10 transition flex-shrink-0 self-start sm:self-auto">
              View All Channels
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
            {!channels || channels.length === 0 ? (
              [0,1,2,3].map((i) => (
                <div key={i} className="flex-shrink-0 w-[158px] h-[210px] snap-start rounded-[14px] bg-white/5 animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
              ))
            ) : (
              channels.map((ch) => (
                <Link key={ch.slug} href={`/channels/${ch.slug}`}
                  className="flex-shrink-0 w-[158px] snap-start rounded-[14px] overflow-hidden no-underline"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}>
                  <div style={{ aspectRatio: '1', overflow: 'hidden', background: 'rgba(165,180,252,.06)' }}>
                    {ch.cover_image ? (
                      <img src={ch.cover_image} alt={ch.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '38px' }}>💍</div>
                    )}
                  </div>
                  <div style={{ padding: '10px 12px 14px' }}>
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                    {ch.description && (
                      <div style={{ color: 'rgba(255,255,255,.45)', fontSize: '12px', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.description}</div>
                    )}
                    <div style={{ color: '#a5b4fc', fontSize: '10px', fontWeight: 700, marginTop: '7px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Channel</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ background: '#f2f0eb' }} aria-labelledby="testi-heading">
        <div className="max-w-[1280px] mx-auto px-8 py-24">
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[#006241] mb-4">
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
              Success Stories
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
            </div>
            <h2 id="testi-heading" className="text-[clamp(2rem,4vw,2.25rem)] font-bold text-[rgba(0,0,0,0.87)] leading-[1.22] tracking-[-0.02em]">
              Families Who Found Their Match Here
            </h2>
          </div>
          <Masonry
            animateFrom="bottom"
            stagger={0.07}
            blurToFocus
            scaleOnHover
            hoverScale={0.97}
            columns={[3, 3, 2, 1]}
            items={[
              { id: 'am', height: 220, content: <TestimonialCard bg="#fff"      color="#1E3932" initials="AM" name="Abrar Mohammed" city="Hyderabad, Telangana"  quote="Alhamdulillah, my son found a wonderful bride through InstaRishta within 2 months. The profiles were genuine and the contact process was done with full family involvement — just as Islam teaches." /> },
              { id: 'sb', height: 240, content: <TestimonialCard bg="#f5fbf8"   color="#2b5148" initials="SB" name="Shabana Begum"  city="Mumbai, Maharashtra"    quote="As a single mother looking for a rishta for my daughter, I was nervous. InstaRishta was respectful, private, and the profiles were serious. We found a good match — may Allah keep them happy." /> },
              { id: 'za', height: 220, content: <TestimonialCard bg="#f0faf5"   color="#006241" initials="ZA" name="Zainab Ahmed"   city="Bengaluru, Karnataka"   quote="I tried Shaadi.com and was frustrated by the noise. InstaRishta is different — Muslim only, clean profiles, and real rishtas. Found my nikah match in just 6 weeks. Subhan'Allah!" /> },
              { id: 'rk', height: 200, content: <TestimonialCard bg="#fff"      color="#00754A" initials="RK" name="Rizwan Khan"    city="Delhi, NCR"              quote="The wali-first approach is exactly what I was looking for. My family felt safe and respected throughout the process. Nikah happened in 3 months. JazakAllah khair." /> },
              { id: 'fh', height: 230, content: <TestimonialCard bg="#f5f3ff"   color="#1E3932" initials="FH" name="Fatima Hussain" city="Lahore, Pakistan"        quote="Very clean platform, no unnecessary messaging. My profile was verified quickly and I received serious proposals within a week. The halal approach makes all the difference." /> },
              { id: 'ma', height: 210, content: <TestimonialCard bg="#f0faf5"   color="#2b5148" initials="MA" name="Maryam Ansari"  city="Toronto, Canada"         quote="As an NRI looking for a match back home, InstaRishta had genuinely verified profiles. The education and family details were accurate. Found a wonderful match, alhamdulillah!" /> },
            ]}
          />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ background: '#edebe9' }} aria-labelledby="faq-heading">
        <div className="max-w-[1280px] mx-auto px-8 py-24 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-12 md:gap-20 items-start">
          <div>
            <div className="flex items-center gap-[10px] text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[#006241] mb-4">
              <span className="block h-px w-7 rounded-full bg-current opacity-[0.35]" />
              FAQ
            </div>
            <h2 id="faq-heading" className="text-[clamp(2rem,4vw,2.25rem)] font-bold text-[rgba(0,0,0,0.87)] leading-[1.22] tracking-[-0.02em] mb-4">
              Questions About InstaRishta?
            </h2>
            <p className="text-[1rem] text-[rgba(0,0,0,0.58)] max-w-[560px] leading-[1.5]">
              Everything you need to know about finding a halal match on InstaRishta, answered clearly.
            </p>
            <div className="mt-8">
              <Link href="/profiles" className="btn-primary inline-flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                Start Browsing Now
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {FAQS.map((faq) => (
              <div key={faq.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,.06)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
                  aria-expanded={openFaq === faq.id}
                >
                  <span className="text-[0.9rem] font-semibold text-[rgba(0,0,0,0.87)]">{faq.q}</span>
                  <span
                    className="text-[1.2rem] text-[rgba(0,0,0,0.45)] flex-shrink-0 transition-transform duration-200 inline-block"
                    style={{ transform: openFaq === faq.id ? 'rotate(45deg)' : 'none' }}
                  >+</span>
                </button>
                {openFaq === faq.id && (
                  <div className="px-6 pb-5 text-[0.875rem] text-[rgba(0,0,0,0.58)] leading-[1.6]">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="relative overflow-hidden bg-[#00754A]" aria-labelledby="cta-heading">
        <div className="relative z-[2] py-28 px-8">
          <div className="max-w-[900px] mx-auto text-center">
            <div className="font-arab text-[2rem] text-[#cba258] mb-4" aria-label="And We created you in pairs">
              وَخَلَقْنَاكُمْ أَزْوَاجًا
            </div>
            <h2 id="cta-heading" className="text-white text-[clamp(2rem,5vw,2.25rem)] font-bold tracking-[-0.02em] leading-[1.22] mb-5">
              Your Halal Match Is Waiting for You.
            </h2>
            <p className="text-[rgba(255,255,255,0.70)] text-[1rem] max-w-[520px] mx-auto leading-[1.5] mb-10">
              Join hundreds of Muslim families who found verified, serious marriage proposals on InstaRishta.
              Begin your nikah journey today — free, private, and family-approved.
            </p>
            <div className="flex justify-center flex-wrap gap-4">
              <Link href="/profiles"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold text-[1rem] no-underline transition hover:-translate-y-[1px]"
                style={{ background: '#fff', color: '#000' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                Browse Profiles — Free
              </Link>
              <Link href="/biodata"
                className="inline-flex items-center text-white/90 text-[1rem] font-medium no-underline px-6 py-3.5 rounded-full border border-white/25 hover:bg-white/10 hover:border-white/50 transition">
                📝 Post Your Rishta Profile
              </Link>
            </div>
            <div className="mt-6 text-white text-[0.8rem] flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <span>✓ Free to Browse</span>
              <span>✓ Muslim Only</span>
              <span>✓ Family-First Contact</span>
              <span>✓ Verified Profiles</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function HeroCard({ initials, name, meta, color, tags }: { initials: string; name: string; meta: string; color: string; tags: string[] }) {
  return (
    <div className="rounded-[12px] p-4 bg-white/5 border border-white/10 backdrop-blur-[8px] transition hover:-translate-y-1 hover:border-white/30">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-[42px] h-[42px] rounded-full text-white font-bold text-[1.1rem] flex items-center justify-center flex-shrink-0" style={{ background: color }}>{initials}</div>
        <div className="min-w-0">
          <div className="text-white text-[0.9rem] font-semibold">{name}</div>
          <div className="text-white/50 text-[0.74rem]">{meta}</div>
        </div>
        <div className="ml-auto inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[0.68rem] font-medium text-[#00C87A] bg-[rgba(34,200,122,.12)] border border-[rgba(34,200,122,.25)] flex-shrink-0">
          <span className="w-[5px] h-[5px] rounded-full bg-[#00C87A]" />Verified
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="px-2 py-1 rounded-full text-[0.68rem] text-white/70 bg-white/10">{tag}</span>
        ))}
      </div>
    </div>
  );
}
