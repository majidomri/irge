/**
 * The complete vocabulary a member may post as a comment on a channel post
 * or story — public, unlike the private chips in interest-chips.ts.
 *
 * Free text was left out on purpose, same reasoning as interest-chips.ts: a
 * public comment box under a real person's photo is a permanent harassment
 * surface. A fixed vocabulary removes the entire class of problem while
 * still letting people signal genuine interest.
 *
 * `key` is what gets stored — never the label — so wording can be reworded
 * later without rewriting history. Keys must therefore stay stable.
 */
export interface CommentChip {
  key:   string;
  label: string;   // English
  ur:    string;   // Urdu
  icon:  string;
}

export const COMMENT_CHIPS: readonly CommentChip[] = [
  { key: 'interested',   label: 'I am interested',      ur: 'مجھے دلچسپی ہے',         icon: '🙋' },
  { key: 'view_profile', label: 'Look at my Profile',   ur: 'میری پروفائل دیکھیں',     icon: '👀' },
  { key: 'is_done',      label: 'Is this Rishta Done?', ur: 'کیا یہ رشتہ طے ہو گیا؟',  icon: '❓' },
  { key: 'answer_asap',  label: 'Please Answer ASAP',   ur: 'جلد از جلد جواب دیں',     icon: '⏰' },
] as const;

export const COMMENT_CHIP_KEYS: readonly string[] = COMMENT_CHIPS.map(c => c.key);

export function isCommentChipKey(v: unknown): v is string {
  return typeof v === 'string' && COMMENT_CHIP_KEYS.includes(v);
}

export function commentChipLabel(key: string | null | undefined): string {
  return COMMENT_CHIPS.find(c => c.key === key)?.label ?? '—';
}

export function commentChipIcon(key: string | null | undefined): string {
  return COMMENT_CHIPS.find(c => c.key === key)?.icon ?? '💬';
}
