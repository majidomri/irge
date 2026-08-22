'use client';
import { useState } from 'react';
import { shareUrl } from '@/lib/nanoid';

/**
 * Full share sheet — a richer alternative to ShareButton's single
 * copy-to-clipboard action, for the main share affordance on the in-feed
 * post viewer. ShareButton stays as-is for compact inline chips (post
 * grids, /post/[slug]'s action row) — this is additive, not a replacement.
 */
export default function ShareSheet({
  slug, entityType, title, onClose,
}: {
  slug: string;
  entityType: string;
  title: string;
  onClose: () => void;
}) {
  const url = shareUrl(entityType, slug);
  const [copied, setCopied] = useState(false);

  const track = (dest: string) => {
    fetch('/api/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, event: 'share', source: dest }),
    }).catch(() => {});
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track('copy');
    } catch { /* clipboard unavailable — user can still select the text field */ }
  };

  const openSystemShare = async () => {
    if (!navigator.share) return;
    try { await navigator.share({ title, url }); track('system'); } catch { /* user cancelled */ }
  };

  const destinations = [
    {
      key: 'whatsapp', label: 'WhatsApp', bg: '#25D366', fg: '#fff',
      href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 20zm4.4-5.9c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.4-1.7-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.1-.4 0-.1-.5-1.2-.7-1.7-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.7.7-1 1.5-1 2.4.1 1 .5 2 1.2 2.9 1.2 1.7 2.6 3 4.4 3.8.6.3 1.2.5 1.9.6.7.1 1.3.1 1.9-.1.6-.2 1.2-.7 1.4-1.3.1-.3.1-.7.1-.9-.1-.1-.2-.2-.4-.3z" /></svg>
      ),
    },
    {
      key: 'x', label: 'X', bg: '#000', fg: '#fff',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-6.6L4.5 22H1.4l8.1-9.3L1 2h7.2l5 6L18.9 2zm-1.2 18h1.7L7.4 4H5.6l12.1 16z" /></svg>
      ),
    },
    {
      key: 'telegram', label: 'Telegram', bg: '#26A5E4', fg: '#fff',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22 4.1 2.7 11.6c-1.3.5-1.3 1.2-.2 1.5l4.9 1.5 1.9 5.8c.2.6.4.9.9.9.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14.1c.3-1.3-.4-1.9-1.5-1.5zM8.6 13.6l9.3-5.9c.4-.3.8 0 .5.4l-7.5 6.9-.3 3.2z" /></svg>
      ),
    },
    {
      key: 'email', label: 'Email', bg: 'rgba(255,255,255,0.1)', fg: '#fff',
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden p-5"
        style={{ background: '#141413', color: '#fff', zIndex: 1 }}>

        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Share</p>
            <h2 className="text-sm font-extrabold truncate max-w-[240px]">{title}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>×</button>
        </div>

        <div className="flex gap-4 mb-5">
          <button onClick={copyLink} className="flex flex-col items-center gap-1.5 border-0 bg-transparent cursor-pointer">
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E08C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
              )}
            </div>
            <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>{copied ? 'Copied' : 'Copy link'}</span>
          </button>
          {destinations.map(d => (
            <a key={d.key} href={d.href} target="_blank" rel="noopener noreferrer" onClick={() => track(d.key)}
              className="flex flex-col items-center gap-1.5 no-underline">
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: d.bg, color: d.fg }}>
                {d.icon}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>{d.label}</span>
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <p className="flex-1 text-xs truncate" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{url}</p>
          <button onClick={copyLink} className="text-xs font-extrabold shrink-0 border-0 bg-transparent cursor-pointer"
            style={{ color: '#00E08C' }}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>

        {typeof navigator !== 'undefined' && !!navigator.share && (
          <button onClick={openSystemShare}
            className="w-full rounded-xl py-3 text-sm font-bold border"
            style={{ borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', background: 'transparent', color: '#fff' }}>
            Open system share sheet ↗
          </button>
        )}
      </section>
    </div>
  );
}
