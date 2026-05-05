'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getChannels, type IChannel } from '@/lib/supabase';

const CATEGORIES = [
  { id: 'medical',   label: 'Medical & Health',      kw: ['doctor','mbbs','surgeon','physician','nurse','pharmacist','dentist','medical','hospital','health'] },
  { id: 'tech',      label: 'Tech & Engineering',     kw: ['engineer','software','developer','it ','technology','computer','programming','ai','data','cyber','electronics','mechanical','civil','electrical'] },
  { id: 'business',  label: 'Business & Finance',     kw: ['business','entrepreneur','finance','banking','accountant','ca ','chartered','mba','manager','marketing','sales','commerce'] },
  { id: 'education', label: 'Education',              kw: ['teacher','professor','lecturer','education','school','university','tutor','academic','phd','research'] },
  { id: 'legal',     label: 'Legal & Law',            kw: ['lawyer','advocate','legal','law','attorney','judge','court','llb','llm'] },
  { id: 'govt',      label: 'Government & Services',  kw: ['ias','ips','ifs','government','civil service','military','army','navy','air force','police','upsc'] },
];

function categorize(ch: IChannel): string {
  const hay = ((ch.name ?? '') + ' ' + (ch.description ?? '')).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.kw.some(k => hay.includes(k))) return cat.id;
  }
  return 'others';
}

function ChannelCard({ ch }: { ch: IChannel }) {
  return (
    <Link
      href={`/channels/${ch.slug}`}
      className="flex flex-col items-center gap-3 no-underline group"
    >
      <div className="relative">
        <div
          className="w-[130px] h-[130px] rounded-full overflow-hidden transition-transform duration-200 group-hover:-translate-y-1"
          style={{ background: '#F3F0EE', boxShadow: '0px 24px 48px rgba(0,0,0,0.08)' }}
        >
          {ch.cover_image
            ? <img src={ch.cover_image} alt={ch.name} className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center text-4xl">💍</div>
          }
        </div>
        <div
          className="absolute bottom-0.5 -right-1.5 w-9 h-9 rounded-full bg-white flex items-center justify-center text-sm transition-transform duration-200 group-hover:scale-110"
          style={{ boxShadow: '0px 4px 14px rgba(0,0,0,0.12)', color: '#141413' }}
        >→</div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.04em] mb-1" style={{ color: '#696969' }}>Channel</p>
        <p className="text-sm font-bold leading-snug" style={{ color: '#141413' }}>{ch.name}</p>
        {ch.description && <p className="text-xs mt-0.5 leading-snug" style={{ color: '#696969' }}>{ch.description}</p>}
      </div>
    </Link>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels]   = useState<IChannel[]>([]);
  const [query, setQuery]         = useState('');
  const [filter, setFilter]       = useState('all');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = channels.filter(ch => {
    if (query && !ch.name.toLowerCase().includes(query) && !(ch.description ?? '').toLowerCase().includes(query)) return false;
    if (filter !== 'all' && categorize(ch) !== filter) return false;
    return true;
  });

  const groups: Record<string, IChannel[]> = {};
  visible.forEach(ch => {
    const cid = categorize(ch);
    (groups[cid] ??= []).push(ch);
  });
  const orderedIds = [...CATEGORIES.map(c => c.id), 'others'].filter(id => groups[id]);
  const usedCats   = new Set(channels.map(categorize));

  const toggle = (id: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="max-w-[1280px] mx-auto px-6 pt-14 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.06em] mb-3" style={{ color: '#696969' }}>Discover</p>
        <h1 className="text-[clamp(2rem,5vw,3rem)] font-extrabold tracking-[-0.03em]" style={{ color: '#141413' }}>Profile Channels</h1>
      </div>

      {/* Search + filters */}
      <div className="max-w-[1280px] mx-auto px-6 pb-8 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value.toLowerCase())}
          placeholder="Search channels…"
          className="rounded-full px-5 py-2.5 text-sm font-medium border outline-none"
          style={{ borderColor: '#141413', background: '#fff', color: '#141413' }}
        />
        <div className="flex gap-2 flex-wrap">
          {['all', ...CATEGORIES.filter(c => usedCats.has(c.id)).map(c => c.id), ...(usedCats.has('others') ? ['others'] : [])].map(id => {
            const label = id === 'all' ? 'All' : id === 'others' ? 'Other' : (CATEGORIES.find(c => c.id === id)?.label ?? id);
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className="rounded-full px-4 py-1.5 text-xs font-semibold border transition-colors"
                style={{
                  background: filter === id ? '#141413' : '#fff',
                  color:      filter === id ? '#fff'    : '#696969',
                  borderColor: filter === id ? '#141413' : '#D1CDC7',
                }}
              >{label}</button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-6 px-5 py-3 rounded-2xl text-sm font-medium" style={{ background: 'rgba(207,69,0,0.07)', border: '1.5px solid rgba(207,69,0,0.25)', color: '#CF4500' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      )}

      {/* Grid sections */}
      {!loading && (
        <div className="max-w-[1280px] mx-auto pb-20">
          {!orderedIds.length && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">💍</div>
              <p className="text-lg font-medium" style={{ color: '#141413' }}>No channels found</p>
              <p className="text-sm mt-1" style={{ color: '#696969' }}>Try a different search or filter</p>
            </div>
          )}
          {orderedIds.map((cid, i) => {
            const label = cid === 'others' ? 'Other Channels' : (CATEGORIES.find(c => c.id === cid)?.label ?? cid);
            const items = groups[cid];
            const isCollapsed = collapsed.has(cid);
            return (
              <div key={cid} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FCFBFA' }}>
                <button
                  onClick={() => toggle(cid)}
                  className="w-full flex items-center gap-3 px-6 py-5 text-left"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#006241' }} />
                  <span className="text-xs font-bold uppercase tracking-[0.06em] flex-1" style={{ color: '#696969' }}>{label}</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(0,98,65,0.10)', color: '#006241' }}>{items.length}</span>
                  <span className="text-lg transition-transform" style={{ color: '#D1CDC7', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>›</span>
                </button>
                {!isCollapsed && (
                  <div className="px-6 pb-8">
                    <div className="grid gap-x-8 gap-y-10" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {items.map(ch => <ChannelCard key={ch.id} ch={ch} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
