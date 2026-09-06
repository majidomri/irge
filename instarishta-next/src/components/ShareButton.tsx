'use client';

import { useState } from 'react';
import { shareUrl } from '@/lib/nanoid';

interface Props {
  slug:       string;
  entityType: string;
  label?:     string;
  size?:      'sm' | 'md';
  /**
   * Set when the button sits on the dark green header. The button is
   * transparent, so it inherits whatever is behind it — and the default
   * #696969 is 2.26 against #1E3932, well under the 4.5 it needs.
   */
  onDark?:    boolean;
}

export default function ShareButton({ slug, entityType, label, size = 'md', onDark = false }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleShare() {
    const url = shareUrl(entityType, slug);
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2500);

      // Record share event (fire-and-forget)
      fetch('/api/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug, event: 'share', source: 'copy' }),
      }).catch(() => {});
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  }

  const isSm = size === 'sm';

  return (
    <button
      onClick={handleShare}
      title={`Share — ${shareUrl(entityType, slug)}`}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            isSm ? 4 : 6,
        padding:        isSm ? '4px 10px' : '7px 16px',
        borderRadius:   100,
        border:         '1px solid',
        borderColor:    state === 'copied'
          ? '#006241'
          : onDark ? 'rgba(255,255,255,0.45)' : '#D1CDC7',
        background:     state === 'copied' ? '#F0FAF5' : 'transparent',
        color:          state === 'copied'
          ? '#006241'
          : onDark ? 'rgba(255,255,255,0.92)' : '#696969',
        fontSize:       isSm ? 11 : 13,
        fontWeight:     600,
        letterSpacing:  '-0.2px',
        cursor:         'pointer',
        transition:     'all 0.2s',
        whiteSpace:     'nowrap',
      }}
    >
      {state === 'copied' ? (
        <>
          <svg width={isSm ? 12 : 14} height={isSm ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width={isSm ? 12 : 14} height={isSm ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {label ?? 'Share'}
        </>
      )}
    </button>
  );
}
