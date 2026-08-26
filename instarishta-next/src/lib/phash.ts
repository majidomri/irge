/**
 * Perceptual hashing + text fingerprinting for the WhatsApp bulk importer.
 *
 * Runs in the browser (canvas), before anything is uploaded — a duplicate
 * costs nothing to detect locally and would otherwise cost a storage upload,
 * a database round-trip and, worst of all, one of the admin's taps.
 *
 * The image side is the standard DCT pHash: greyscale → 32×32 → 2D DCT →
 * keep the top-left 8×8 low-frequency block → threshold each coefficient
 * against the block median → 64 bits. Insensitive to re-compression, scale
 * and small brightness shifts, which is exactly how WhatsApp mangles an
 * image on each forward.
 */

const SIZE = 32; // DCT input resolution
const HASH = 8;  // low-frequency block kept, HASH*HASH = 64 bits

// tsconfig targets ES2017, which bars BigInt literals (0n). BigInt() calls are
// fine, so the constants live here rather than inline.
const ZERO = BigInt(0);
const ONE  = BigInt(1);

/** Precomputed DCT-II cosine table: COS[u][x] = cos((2x+1)uπ / 2N). */
const COS: number[][] = (() => {
  const t: number[][] = [];
  for (let u = 0; u < SIZE; u++) {
    t[u] = [];
    for (let x = 0; x < SIZE; x++) {
      t[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE));
    }
  }
  return t;
})();

/** Separable 2D DCT-II. Rows then columns — O(2·N³) instead of O(N⁴). */
function dct2d(input: Float64Array): Float64Array {
  const rows = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let u = 0; u < SIZE; u++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) sum += input[y * SIZE + x] * COS[u][x];
      rows[y * SIZE + u] = sum;
    }
  }
  const out = new Float64Array(SIZE * SIZE);
  for (let u = 0; u < SIZE; u++) {
    for (let v = 0; v < SIZE; v++) {
      let sum = 0;
      for (let y = 0; y < SIZE; y++) sum += rows[y * SIZE + u] * COS[v][y];
      out[v * SIZE + u] = sum;
    }
  }
  return out;
}

/**
 * 64-bit perceptual hash of an already-decoded image, as a signed BigInt
 * ready for a Postgres BIGINT column.
 */
export function phashFromBitmap(bitmap: ImageBitmap | HTMLImageElement): bigint {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');

  // White backdrop first: biodata images are often transparent PNGs, and
  // drawing those onto the default transparent-black canvas turns light text
  // dark and changes the hash.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const grey = new Float64Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    // Rec. 601 luma
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const freq = dct2d(grey);

  // Top-left HASH×HASH block, minus the DC term at [0][0] — DC carries only
  // average brightness and would swamp the median.
  const block: number[] = [];
  for (let v = 0; v < HASH; v++) {
    for (let u = 0; u < HASH; u++) {
      if (u === 0 && v === 0) continue;
      block.push(freq[v * SIZE + u]);
    }
  }

  const sorted = [...block].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];

  // Rebuild all 64 positions in order; the skipped DC slot takes bit 0.
  let bits = ZERO;
  let k = 0;
  for (let v = 0; v < HASH; v++) {
    for (let u = 0; u < HASH; u++) {
      const on = u === 0 && v === 0 ? false : block[k++] > median;
      bits = (bits << ONE) | (on ? ONE : ZERO);
    }
  }

  // Postgres BIGINT is signed; wrap the unsigned 64-bit value into range.
  return BigInt.asIntN(64, bits);
}

/** Decode a File and hash it. Returns null for anything that isn't a decodable image. */
export async function phashFromFile(file: File): Promise<bigint | null> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return phashFromBitmap(bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Number of differing bits between two 64-bit hashes. */
export function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) {
    x &= x - ONE;
    n++;
  }
  return n;
}

/**
 * Distance at or below which two images are "the same biodata, forwarded".
 *
 * 10 is the usual pHash near-duplicate threshold and is tuned for photographs.
 * Biodata images are mostly text on a flat background, so their hashes cluster
 * much more tightly than photos do and a loose threshold starts collapsing
 * genuinely different profiles that share a template. 6 keeps re-compressed
 * forwards together without merging two different people's cards.
 */
export const PHASH_THRESHOLD = 6;

/**
 * Normalise caption text down to its semantic core, then SHA-256 it.
 *
 * The normalisation is deliberately aggressive because re-forwarded text
 * biodata picks up decoration on every hop: emoji borders, "*bold*" markers,
 * a new group's header line, inconsistent spacing. Stripping all of it means
 * the same profile hashes identically however it was dressed up.
 */
export async function textHash(text: string): Promise<string | null> {
  const normalised = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')            // combining marks
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')            // keep letters/digits only — Urdu & Devanagari included
    .trim();

  // Too short to fingerprint meaningfully: "hi", "salam", a bare number. Two
  // unrelated one-word captions would collide and the second would be
  // rejected as a duplicate, so these opt out of text dedup entirely.
  if (normalised.length < 40) return null;

  const bytes = new TextEncoder().encode(normalised);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Phone numbers and contact handles, for the pre-flag pass.
 *
 * Detection only — nothing here edits the image. The importer shows a warning
 * badge so the admin can send an item to the "needs redaction" pile with one
 * tap instead of reading every card looking for a number.
 */
const CONTACT_PATTERNS: RegExp[] = [
  /(?:\+?91[\s-]?)?[6-9]\d{9}/,                          // Indian mobile, optional +91
  /\b\d{3,5}[\s-]\d{5,7}\b/,                             // split landline/mobile
  /(?:\d[\s.–-]{0,2}){9,14}\d/,                     // digits spaced out to dodge filters
  /\b(?:wa\.me|chat\.whatsapp\.com|t\.me|telegram\.me)\b/i,
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,                      // email
  /\b(?:whats\s?app|watsapp|contact|mobile|mob|cell|phone|ph)\s*(?:no\.?|number|#)?\s*[:\-]/i,
  /\b(?:nine|eight|seven|six|five|four|three|two|one|zero)(?:\s+(?:nine|eight|seven|six|five|four|three|two|one|zero)){6,}/i,
];

export function looksLikeContact(text: string): boolean {
  return CONTACT_PATTERNS.some(re => re.test(text));
}
