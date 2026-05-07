'use client';
import { useEffect, useState } from 'react';
import { getContacts, consumeRevealedNumbers, maskNumber, type ContactEntry } from '@/lib/contact-log';

function fmt(iso: string) {
  const d    = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

function WAIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.22 4.05 2 2 0 012.2 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.28 6.28l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

export default function ContactedPage() {
  const [entries,  setEntries]  = useState<ContactEntry[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    // consumeRevealedNumbers: reads entries, flips revealed→false, returns freshIds for this render
    const { entries: all, freshIds: fresh } = consumeRevealedNumbers();
    setEntries(all);
    setFreshIds(fresh);
    setMounted(true);
  }, []);

  const waCount        = entries.filter(e => e.type === 'whatsapp').length;
  const callCount      = entries.filter(e => e.type === 'call').length;
  const total          = entries.length;
  const uniqueProfiles = new Set(entries.map(e => e.profileNum)).size;

  if (!mounted) return null;

  return (
    <div style={{ background: '#F8F7F6', minHeight: '100vh', paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ background: '#1E3932', color: '#fff' }} className="px-4 pt-12 pb-6">
        <h1 className="text-xl font-extrabold tracking-tight mb-1">Contacted</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Your outgoing contact history — transparent &amp; private.
        </p>
      </div>

      {/* Stats cards */}
      <div className="px-4 -mt-4 grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: '#fff', border: '1px solid #F0ECE8' }}>
          <p className="text-2xl font-extrabold" style={{ color: '#141413' }}>{total}</p>
          <p className="text-[11px] font-semibold mt-0.5 uppercase tracking-wider" style={{ color: '#A0A0A0' }}>Total</p>
        </div>
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: '#fff', border: '1px solid #F0ECE8' }}>
          <div className="flex items-center gap-1 mb-0.5">
            <WAIcon />
            <p className="text-2xl font-extrabold" style={{ color: '#25D366' }}>{waCount}</p>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#A0A0A0' }}>WhatsApp</p>
        </div>
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: '#fff', border: '1px solid #F0ECE8' }}>
          <p className="text-2xl font-extrabold" style={{ color: '#141413' }}>{callCount}</p>
          <p className="text-[11px] font-semibold mt-0.5 uppercase tracking-wider" style={{ color: '#A0A0A0' }}>Calls</p>
        </div>
      </div>

      {/* Unique profiles summary pill */}
      {total > 0 && (
        <div className="mx-4 mb-5 px-4 py-3 rounded-2xl flex items-center gap-3"
          style={{ background: 'rgba(0,98,65,0.07)', border: '1px solid rgba(0,98,65,0.15)' }}>
          <span className="text-xl">📋</span>
          <div>
            <p className="text-sm font-bold" style={{ color: '#006241' }}>
              {uniqueProfiles} unique profile{uniqueProfiles !== 1 ? 's' : ''} contacted
            </p>
            <p className="text-xs" style={{ color: '#696969' }}>
              via InstaRishta&apos;s verified contact number
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] font-bold font-mono" style={{ color: '#141413' }}>+918886667121</p>
            <p className="text-[10px]" style={{ color: '#A0A0A0' }}>InstaRishta</p>
          </div>
        </div>
      )}

      {/* Notice — number masking */}
      {total > 0 && (
        <div className="mx-4 mb-4 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: 'rgba(200,150,12,0.08)', border: '1px solid rgba(200,150,12,0.2)' }}>
          <span className="text-sm">🔒</span>
          <p className="text-[11px]" style={{ color: '#8a6a00' }}>
            Numbers are shown in full only once for privacy. After that they are permanently masked.
          </p>
        </div>
      )}

      {/* Contact log list */}
      {total === 0 ? (
        <div className="text-center py-20 px-6">
          <span className="text-5xl block mb-4">📵</span>
          <p className="text-base font-semibold mb-1" style={{ color: '#141413' }}>No contacts yet</p>
          <p className="text-sm" style={{ color: '#696969' }}>
            When you tap WhatsApp or Call on a profile, it will appear here.
          </p>
        </div>
      ) : (
        <div className="px-4">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#A0A0A0' }}>
            History · {total} entries
          </p>

          <div className="flex flex-col gap-2.5 pb-4">
            {entries.map(e => {
              const isFresh  = freshIds.has(e.id);
              const display  = isFresh ? e.number : maskNumber(e.number);
              return (
                <div key={e.id}
                  className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                  style={{ background: '#fff', border: `1px solid ${isFresh ? 'rgba(0,98,65,0.2)' : '#F0ECE8'}` }}>

                  {/* Type badge */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: e.type === 'whatsapp' ? 'rgba(37,211,102,0.1)' : '#F3F0EE' }}>
                    {e.type === 'whatsapp' ? <WAIcon /> : <PhoneIcon />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#141413' }}>
                      Profile #{e.profileNum}
                    </p>
                    <p className="text-xs truncate" style={{ color: '#696969' }}>
                      {e.profileTitle || '—'}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#A0A0A0' }}>{fmt(e.timestamp)}</p>
                  </div>

                  {/* Number + type */}
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-bold font-mono" style={{ color: isFresh ? '#006241' : '#A0A0A0' }}>
                      {display}
                    </p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block"
                      style={{
                        background: e.type === 'whatsapp' ? 'rgba(37,211,102,0.1)' : '#F3F0EE',
                        color: e.type === 'whatsapp' ? '#1a9e55' : '#696969',
                      }}>
                      {e.type === 'whatsapp' ? 'WA' : 'Call'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
