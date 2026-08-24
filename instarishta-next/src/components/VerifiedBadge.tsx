'use client';
import { getProfession } from '@/lib/professions';

/**
 * The verified-profession badge.
 *
 * This is the single most load-bearing piece of UI in the product. Every
 * matrimony site in India is full of unchecked "software engineer, 30 LPA"
 * claims; the badge's only job is to say *this one was checked by a human*.
 * So it renders nothing at all unless there is an approved profession_key —
 * there is deliberately no "pending" or "unverified" variant, because a badge
 * that appears before review teaches members the gate means nothing.
 *
 * `size="sm"` is the inline form for lists and comment rows; `md` is for
 * profile headers.
 */
export default function VerifiedBadge({
  professionKey,
  size = 'sm',
  showLabel = true,
}: {
  professionKey: string | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}) {
  const profession = getProfession(professionKey);
  if (!profession) return null;

  const sm = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        sm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        background: 'rgba(0, 168, 107, 0.12)',
        border: '1px solid rgba(0, 168, 107, 0.35)',
        color: '#00A86B',
      }}
      title={`${profession.label} — verified by InstaRishta`}
    >
      <span aria-hidden>{profession.icon}</span>
      {showLabel && <span>{profession.label}</span>}
      <svg
        width={sm ? 11 : 13}
        height={sm ? 11 : 13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="Verified"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
