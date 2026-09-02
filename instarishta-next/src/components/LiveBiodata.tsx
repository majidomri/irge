'use client';

import { useEffect, useRef, useState } from 'react';
import { STAGE, THEME, ZONES } from '@/lib/live-config';
import { AdFrame } from './live/AdFrame';
import { BiodataReel } from './live/BiodataReel';
import { StageGround, StageHeader } from './live/StageFrame';
import { adToValues } from '@/lib/biodata/from-ad';
import { resolveBiodata } from '@/lib/biodata/resolve';
import { paginate } from '@/lib/biodata/paginate';
import type { AdLike } from '@/lib/biodata/from-ad';
import type { ProfileDoc } from '@/lib/biodata/types';

/**
 * The biodata exactly as the live presentation shows it.
 *
 * Not a web rendering of the same data -- the same components. `AdFrame` and
 * `BiodataReel` are the show's own presenters, laid out on the show's
 * 1080x1920 stage, and the frames published to the feed and the stories are
 * screenshots of these. So the popup, the broadcast, the posts and the
 * stories are one thing seen four ways.
 *
 * The stage is a fixed pixel canvas, so it cannot reflow; it is scaled to
 * whatever width it is given instead. That is the trade the show's design
 * makes everywhere, and it is why the frames look identical on air, in the
 * feed and here.
 */
export default function LiveBiodata({ ad, irId }: { ad: AdLike; irId: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scale, setScale] = useState(0.35);
  const [heights, setHeights] = useState<number[]>([]);

  // Fit the stage to the container's width, and remeasure when it changes.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / STAGE.width);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Crop each frame to what it actually carries.
   *
   * The stage is 1920 tall because a broadcast frame has to be, and a short ad
   * leaves the bottom third empty -- which is fine on air, where the frame is
   * on screen for seconds, and poor in a popup you scroll. The rendering is
   * untouched; only the visible box is trimmed to the lowest thing drawn.
   */
  useEffect(() => {
    setHeights(
      stageRefs.current.map((stage) => {
        if (!stage) return STAGE.height;
        const top = stage.getBoundingClientRect().top;
        let low = 0;
        // Only the content. The ground and the header gradient are full-bleed
        // layers -- measuring those just reports the stage's own height back.
        stage.querySelectorAll('[data-frame-content] *').forEach((node) => {
          const r = (node as HTMLElement).getBoundingClientRect();
          if (r.height > 0) low = Math.max(low, r.bottom - top);
        });
        // Back out of the transform, then leave the stage's own bottom margin.
        const unscaled = low / (scale || 1);
        return Math.min(STAGE.height, Math.round(unscaled) + ZONES.pagePad * 2);
      }),
    );
  }, [scale, ad]);

  const values = adToValues(ad);
  const profile: ProfileDoc = {
    id: irId,
    slug: irId,
    isUrgent: ad.priority === 'Urgent',
    values,
  };

  // The same two calls the capture route makes.
  const contentH = STAGE.height - ZONES.content.y - (36 + ZONES.pagePad);
  const bio = resolveBiodata(values, { viewer: 'public', surface: 'page', exclude: ['about', 'contact', 'media'] });
  const facts = bio.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.key !== 'gender')
    .map((f) => ({ key: f.key, label: f.short, display: f.display, icon: f.icon }));

  // Anything the ad frame does not already carry runs on as further pages,
  // the way a full biodata does on air.
  const broadcast = resolveBiodata(values, { surface: 'broadcast', maxQuickFacts: 9 });
  const pages = paginate(broadcast.sections, contentH).filter(
    (page) => page.reduce((n, sec) => n + sec.fields.length, 0) >= 3,
  );

  const frames = [
    <AdFrame key="intro" profile={profile} facts={facts} />,
    ...pages.map((page, i) => (
      <div
        key={`page-${i}`}
        className="absolute"
        style={{
          left: ZONES.content.x,
          top: ZONES.content.y,
          width: ZONES.content.w,
          height: contentH,
          paddingLeft: ZONES.gutter + ZONES.pagePad,
          paddingRight: ZONES.gutter + ZONES.pagePad,
          overflow: 'hidden',
        }}
      >
        <BiodataReel sections={page} beat="profile" />
      </div>
    )),
  ];

  return (
    <div ref={boxRef} className="w-full flex flex-col gap-3">
      {frames.map((frame, i) => (
        <div
          key={i}
          style={{
            width: '100%',
            height: (heights[i] ?? STAGE.height) * scale,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            border: `1px solid ${THEME.hairline}`,
          }}
        >
          <div
            ref={(el) => { stageRefs.current[i] = el; }}
            style={{
              width: STAGE.width,
              height: STAGE.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              left: 0,
              top: 0,
              background: THEME.ground,
              overflow: 'hidden',
            }}
          >
            <StageGround />
            <StageHeader animate={false} />
            <div data-frame-content>{frame}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
