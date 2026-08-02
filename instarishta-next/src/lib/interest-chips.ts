/**
 * The complete vocabulary a sender may attach to an interest.
 *
 * Free text was removed deliberately. A message box aimed at a stranger's
 * family is a permanent harassment and spam surface that needs moderating
 * forever; a fixed vocabulary removes the entire class of problem, is instantly
 * scannable by the team, and lets Urdu-speaking users express themselves
 * without transliteration.
 *
 * `key` is what gets stored — never the label — so wording can be reworded
 * later without rewriting history. Keys must therefore stay stable.
 *
 * Shared by the client chip picker, the admin queue, and the Telegram alert.
 */
export interface InterestChip {
  key:   string;
  label: string;   // English
  ur:    string;   // Urdu
  icon:  string;
}

export const INTEREST_CHIPS: readonly InterestChip[] = [
  { key: 'for_self',      label: 'Interested for myself',        ur: 'اپنے لیے دلچسپی ہے',        icon: '🙋' },
  { key: 'for_son',       label: 'Interested for my son',        ur: 'اپنے بیٹے کے لیے',           icon: '👨' },
  { key: 'for_daughter',  label: 'Interested for my daughter',   ur: 'اپنی بیٹی کے لیے',           icon: '👩' },
  { key: 'for_relative',  label: 'Interested for a relative',    ur: 'اپنے رشتہ دار کے لیے',       icon: '👪' },
  { key: 'send_biodata',  label: 'Please share full biodata',    ur: 'مکمل بائیو ڈیٹا بھیجیں',     icon: '📄' },
  { key: 'family_talk',   label: 'Our families should speak',    ur: 'گھر والوں سے بات کروائیں',   icon: '🤝' },
] as const;

export const CHIP_KEYS: readonly string[] = INTEREST_CHIPS.map(c => c.key);

export function isChipKey(v: unknown): v is string {
  return typeof v === 'string' && CHIP_KEYS.includes(v);
}

export function chipLabel(key: string | null | undefined): string {
  return INTEREST_CHIPS.find(c => c.key === key)?.label ?? '—';
}
