/**
 * The legal entity behind InstaRishta.
 *
 * DLT (TRAI) principal-entity registration and Google RCS brand verification
 * both cross-check the operator named on the website against the name on the
 * GST / registration certificate. Those reviewers read the rendered page, so
 * the entity has to be *visible* — not just true. Everything that prints the
 * operator pulls from here so the string can never drift between the footer,
 * the Terms, the Privacy Policy and the refund page.
 */
export const ENTITY = {
  /** Exactly as it appears on the GST certificate. Do not reword. */
  legalName: 'PrimeConnect Solutions (Sole Proprietorship)',
  /** Short form, for running prose where the full string reads badly. */
  shortName: 'PrimeConnect Solutions',
  /** Brands operated by this entity — DLT filings list both. */
  brands: ['InstaRishta (instarishta.me)', 'Xavio (xavio.in)'],
  address: 'Hyderabad, Telangana — 500001, India',
  supportEmail: 'support@instarishta.me',
  safetyEmail: 'safety@instarishta.me',
  privacyEmail: 'privacy@instarishta.me',
  whatsapp: '+91 888 666 7121',
} as const;

/** One-line operator disclosure. Used in the footer and on every legal page. */
export const OPERATOR_LINE =
  `InstaRishta is owned and operated by ${ENTITY.legalName}, registered in India.`;
