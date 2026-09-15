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
  /**
   * As registered: Udyam certificate UDYAM-TS-02-0206425 names the enterprise
   * "PRIMECONNECT SOLUTIONS" (one word), organisation type Proprietary. There
   * is no GSTIN, so the Udyam certificate is the document reviewers match
   * against. Do not reword.
   */
  legalName: 'PrimeConnect Solutions (Sole Proprietorship)',
  /** Short form, for running prose where the full string reads badly. */
  shortName: 'PrimeConnect Solutions',
  /** Brands operated by this entity — DLT filings list both. */
  brands: ['InstaRishta (instarishta.me)', 'Xavio (xavio.in)'],
  /** The official address on the Udyam certificate, verbatim apart from casing. */
  address: 'HNO 18-13-8/M/6, Mohammed Nagar, Bandlaguda, Hyderabad, Telangana 500005, India',
  /** MSME Udyam registration — the business-verification document for DLT and RCS. */
  udyam: 'UDYAM-TS-02-0206425',
  supportEmail: 'support@instarishta.me',
  safetyEmail: 'safety@instarishta.me',
  privacyEmail: 'privacy@instarishta.me',
  /** Support line shown on the site and on the RCS agent. Not the listing relay (NEXT_PUBLIC_BUSINESS_WHATSAPP). */
  whatsapp: '+91 97697 65086',
  whatsappUrl: 'https://wa.me/919769765086',
} as const;

/** One-line operator disclosure. Used in the footer and on every legal page. */
export const OPERATOR_LINE =
  `InstaRishta is owned and operated by ${ENTITY.legalName}, registered in India.`;
