'use client';

import { THEME, ZONES, toIrId } from '@/lib/live-config';
import { fieldIcon } from './icons';
import type { ProfileDoc, ResolvedBiodata } from '@/lib/biodata/types';

/**
 * The opening frame for a biodata with no photograph.
 *
 * The rishta ads carry no portrait and no name -- they are classifieds, not
 * profiles: "ضرورت رشتہ لڑکا", an age, a height, a sect, and a paragraph
 * describing the family and what they are looking for. IntroStage is built
 * around a full-bleed face with the name lockup over it, so on an ad it falls
 * back to a grey placeholder and the frame reads as broken.
 *
 * So this is the typographic opening: the same aubergine ground, the same
 * gold, the same fact grid at the same weights -- but the words are the
 * subject, because in an ad they are all there is.
 *
 * The Urdu is set in the Naskh face `THEME` already names and laid out
 * right-to-left. Rendering it in Inter would break the joins and reverse the
 * reading order, which is worse than not showing it.
 */
export function AdFrame({
  profile,
  facts,
  title,
}: {
  profile: ProfileDoc;
  facts: ResolvedBiodata['quickFacts'];
  /** The ad's own headline, as it was written. */
  title?: string;
}) {
  const irId = toIrId(profile.slug ?? profile.id);
  const about = typeof profile.values.aboutMe === 'string' ? profile.values.aboutMe : undefined;
  const isRtl = about ? /[؀-ۿ]/.test(about) : false;
  const edge = ZONES.gutter + ZONES.pagePad;

  return (
    <div
      className="absolute flex flex-col"
      style={{
        left: ZONES.content.x,
        top: ZONES.content.y,
        width: ZONES.content.w,
        height: ZONES.hostBand.y - ZONES.content.y,
        paddingLeft: edge,
        paddingRight: edge,
        paddingTop: 24,
      }}
    >
      {/* Eyebrow: who the ad is for, and how urgently. */}
      <div className="flex items-center" style={{ gap: 18 }}>
        <span
          style={{
            fontFamily: THEME.mono,
            fontSize: 24,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: THEME.gold,
          }}
        >
          {profile.values.gender === 'bride' ? 'Bride' : 'Groom'}
        </span>
        {profile.isUrgent && (
          <span
            style={{
              fontFamily: THEME.mono,
              fontSize: 22,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: THEME.rose,
              background: THEME.roseDim,
              border: `1px solid rgba(240,114,140,0.45)`,
              borderRadius: 999,
              padding: '8px 18px',
            }}
          >
            Urgent
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: THEME.mono,
            fontSize: 24,
            letterSpacing: '0.18em',
            color: THEME.ground,
            background: THEME.cream,
            borderRadius: 10,
            padding: '8px 16px',
            fontWeight: 700,
          }}
        >
          {irId}
        </span>
      </div>

      {/* The ad's headline. An ad has no name, so this is the largest thing
          on the frame -- it is what the family actually wrote. */}
      {title && (
        <div
          dir="rtl"
          style={{
            fontFamily: THEME.arabic,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.5,
            color: THEME.cream,
            marginTop: 34,
            textAlign: 'right',
          }}
        >
          {title}
        </div>
      )}

      {/* The same grid the intro draws, at the same sizes. Two across rather
          than four: without a portrait above it there is room to let each
          fact breathe, and an ad rarely yields more than six. */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2" style={{ columnGap: 30, rowGap: 30, marginTop: 52 }}>
          {facts.map((f) => {
            const Icon = fieldIcon(f.icon);
            return (
              <div key={f.key} className="flex items-center" style={{ gap: 15, minWidth: 0 }}>
                {Icon && (
                  <Icon
                    style={{ width: 42, height: 42, flexShrink: 0, color: THEME.gold }}
                    strokeWidth={2}
                  />
                )}
                <span style={{ minWidth: 0 }}>
                  <span
                    className="block truncate"
                    style={{
                      fontFamily: THEME.sans,
                      fontSize: 30,
                      fontWeight: 700,
                      color: THEME.cream,
                      lineHeight: 1.12,
                    }}
                  >
                    {f.display}
                  </span>
                  <span
                    className="block truncate"
                    style={{
                      fontFamily: THEME.mono,
                      fontSize: 19,
                      letterSpacing: '0.11em',
                      textTransform: 'uppercase',
                      color: 'rgba(247,239,230,0.72)',
                      marginTop: 4,
                    }}
                  >
                    {f.label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* The ad itself. Everything the extractor could not turn into a field
          -- the income, the visa, the family's own wording, what they are
          looking for -- survives only here, so it gets the room. */}
      {about && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{
            marginTop: 48,
            paddingTop: 34,
            borderTop: `1px solid ${THEME.goldDim}`,
            fontFamily: isRtl ? THEME.arabic : THEME.sans,
            fontSize: isRtl ? 34 : 30,
            lineHeight: isRtl ? 2 : 1.6,
            color: 'rgba(247,239,230,0.88)',
            textAlign: isRtl ? 'right' : 'left',
          }}
        >
          {about}
        </div>
      )}
    </div>
  );
}
