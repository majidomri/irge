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
 * later without rewriting history. Keys must therefore stay stable, and the
 * CHECK constraint on ir_comments.chip_key must list every key here (see
 * migration 018; the first four came from 010).
 *
 * The vocabulary tracks the intents the mainstream matrimony platforms have
 * converged on — send interest, shortlist, "please review my profile",
 * request family/education details, ask whether a profile is still open,
 * follow up on an unanswered interest, and decline courteously — rather than
 * anything invented here. Two additions are specific to a nikah context: an
 * elders/wali introduction, and a question about the family's practice of
 * deen. Sources consulted are listed in docs, not repeated here.
 */
export interface CommentChip {
  key:     string;
  /** Chip face — short enough to read in a wrapped row (2–4 words). */
  label:   string;
  /** What actually gets published in the thread. One or two full sentences,
   *  phrased the way a family would write to another family. */
  message: string;
  /** Urdu rendering of `message`. */
  ur:      string;
  icon:    string;
}

export const COMMENT_CHIPS: readonly CommentChip[] = [
  {
    key: 'interested', icon: '🤝',
    label:   'Express interest',
    message: 'We are interested in this rishta and would like to take it forward, insha’Allah.',
    ur:      'ہمیں اس رشتے میں دلچسپی ہے اور ہم اسے آگے بڑھانا چاہیں گے، ان شاء اللہ۔',
  },
  {
    key: 'view_profile', icon: '👤',
    label:   'Review my profile',
    message: 'Please review my profile at your convenience. If you find it suitable, kindly let me know.',
    ur:      'براہِ کرم اپنی سہولت سے میری پروفائل ملاحظہ فرمائیں۔ اگر مناسب لگے تو مطلع فرمائیں۔',
  },
  {
    key: 'shortlisted', icon: '⭐',
    label:   'Shortlisted',
    message: 'We have shortlisted this profile and would like to know a little more before proceeding.',
    ur:      'ہم نے یہ پروفائل منتخب کی ہے اور آگے بڑھنے سے پہلے کچھ مزید معلوم کرنا چاہیں گے۔',
  },
  {
    key: 'family_details', icon: '🏡',
    label:   'Family details',
    message: 'Could you kindly share a little more about the family background and what you are looking for?',
    ur:      'کیا آپ خاندانی پس منظر اور اپنی توقعات کے بارے میں کچھ مزید بتا سکتے ہیں؟',
  },
  {
    key: 'education_work', icon: '🎓',
    label:   'Education & work',
    message: 'Could you kindly share further details regarding education and profession?',
    ur:      'براہِ کرم تعلیم اور پیشے سے متعلق مزید تفصیلات فراہم فرمائیں۔',
  },
  {
    key: 'deen_practice', icon: '🕌',
    label:   'Deen & practice',
    message: 'We would appreciate knowing more about the family’s practice of deen, insha’Allah.',
    ur:      'ہم خاندان کے دینی معمولات کے بارے میں مزید جاننا چاہیں گے، ان شاء اللہ۔',
  },
  {
    key: 'wali_contact', icon: '📞',
    label:   'Elders may connect',
    message: 'If agreeable, our elders would like to speak with your wali to take this forward respectfully.',
    ur:      'اگر مناسب سمجھیں تو ہمارے بزرگ آپ کے ولی سے بات کرنا چاہیں گے تاکہ معاملہ باوقار طریقے سے آگے بڑھے۔',
  },
  {
    key: 'is_done', icon: '🔎',
    label:   'Still available?',
    message: 'May I know whether this rishta is still open? If it is already settled, please disregard this message.',
    ur:      'کیا معلوم ہو سکتا ہے کہ یہ رشتہ اب بھی دستیاب ہے؟ اگر طے ہو چکا ہے تو براہِ کرم اس پیغام کو نظرانداز فرمائیں۔',
  },
  {
    key: 'answer_asap', icon: '📩',
    label:   'Awaiting reply',
    message: 'I have expressed interest and am awaiting your response. A reply either way would be much appreciated.',
    ur:      'میں نے دلچسپی ظاہر کی ہے اور آپ کے جواب کا منتظر ہوں۔ ہاں یا نہ، جواب دینا قابلِ قدر ہوگا۔',
  },
  {
    key: 'not_a_match', icon: '🤲',
    label:   'Not a match',
    message: 'Jazak Allah khair for your time. This rishta does not appear suitable for us; we wish you the very best.',
    ur:      'آپ کے وقت کے لیے جزاک اللہ خیر۔ یہ رشتہ ہمارے لیے مناسب معلوم نہیں ہوتا؛ اللہ آپ کو بہترین عطا فرمائے۔',
  },
] as const;

export const COMMENT_CHIP_KEYS: readonly string[] = COMMENT_CHIPS.map(c => c.key);

export function isCommentChipKey(v: unknown): v is string {
  return typeof v === 'string' && COMMENT_CHIP_KEYS.includes(v);
}

/** Short chip face. Use in tight surfaces (notification rows, admin tables). */
export function commentChipLabel(key: string | null | undefined): string {
  return COMMENT_CHIPS.find(c => c.key === key)?.label ?? '—';
}

/** The published sentence(s). Use wherever the comment itself is rendered. */
export function commentChipMessage(key: string | null | undefined): string {
  return COMMENT_CHIPS.find(c => c.key === key)?.message ?? '—';
}

export function commentChipIcon(key: string | null | undefined): string {
  return COMMENT_CHIPS.find(c => c.key === key)?.icon ?? '💬';
}
