/**
 * Darknet / spam keyword filter.
 * Reference: https://perishablepress.com/block-darknet-market-spam/
 *
 * Use checkSpam(text) at any user-input boundary (chat, bio, contact form, etc.).
 */

const SPAM_KEYWORDS: string[] = [
  // Generic darknet terms
  'dark net', 'dark web', 'darknet', 'darkweb', 'darkmarket', 'dark market',
  'deep web', 'deepweb',
  'onion link', 'onion market', 'onion site',
  'tor browser', 'tor network', 'tor market',
  '.onion',

  // Market names (regularly updated — add as new ones emerge)
  'nexus market', 'nexus onion',
  'alphabay', 'dream market', 'empire market', 'white house market',
  'hydra market', 'versus market', 'dark0de', 'cannazon',
  'icarus market', 'aurora market', 'archetyp', 'abacus market',
  'tor2door', 'vice city', 'incognito market', 'kingdom market',

  // Drug-related spam signals (common in darknet spam posts)
  'buy cocaine', 'buy heroin', 'buy meth', 'buy fentanyl',
  'buy mdma', 'buy lsd', 'buy ketamine', 'buy pills online',
  'order drugs', 'drugs for sale', 'cheap drugs',

  // Hacking / fraud services
  'buy cvv', 'buy dumps', 'carding forum', 'cc dumps',
  'fullz for sale', 'buy ssn', 'stolen credit card',
  'hire hacker', 'hacking service', 'ddos for hire',
  'buy passport', 'fake id', 'counterfeit money',

  // Crypto mixers / laundering
  'bitcoin mixer', 'btc mixer', 'crypto mixer', 'tumbler service',
  'money laundering',
];

// Pre-compiled lowercase patterns for fast matching
const SPAM_PATTERNS = SPAM_KEYWORDS.map(kw => kw.toLowerCase());

/**
 * Returns true if `text` contains any darknet / spam keyword.
 * Case-insensitive. Use to gate user-submitted content before saving to DB.
 */
export function checkSpam(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SPAM_PATTERNS.some(kw => lower.includes(kw));
}

/**
 * Returns the matched keyword, or null if clean.
 * Useful for logging which keyword triggered the block.
 */
export function findSpamKeyword(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return SPAM_PATTERNS.find(kw => lower.includes(kw)) ?? null;
}
