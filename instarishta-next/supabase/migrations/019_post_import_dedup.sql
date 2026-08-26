-- ============================================================
-- InstaRishta — duplicate fingerprints for imported posts (idempotent)
-- ============================================================
--
-- WhatsApp matrimonial groups forward the same biodata over and over, so a
-- bulk import is mostly repeats. Byte-equality doesn't catch them: WhatsApp
-- re-encodes on every forward, so the "same" image arrives with different
-- bytes each time.
--
-- Two fingerprints, because imported content is either an image or text:
--
--   phash     — 64-bit DCT perceptual hash of the image, stored as BIGINT
--               (signed; the client writes it via BigInt.asIntN so the top
--               bit doesn't overflow). Survives re-compression and small
--               crops. Near-duplicates need a Hamming-distance scan rather
--               than equality, so this one is NOT uniquely indexed — the
--               import route compares candidates in application code.
--
--   text_hash — SHA-256 of the caption after aggressive normalisation
--               (lowercase, punctuation/emoji/whitespace stripped). Text
--               biodata re-forwards identically far more often than images
--               do, so exact-match dedup is worth enforcing in the database.
--
-- Both are nullable: hand-authored posts created through /nizam's normal
-- form have neither, and must not be blocked by the unique index below.

ALTER TABLE public.ir_posts ADD COLUMN IF NOT EXISTS phash     BIGINT;
ALTER TABLE public.ir_posts ADD COLUMN IF NOT EXISTS text_hash TEXT;

-- Scoped to the channel, not global: the same biodata legitimately appears
-- in more than one channel (a Bangalore profile in both the city channel and
-- a profession cohort). Partial, so the many NULL rows are not indexed.
CREATE UNIQUE INDEX IF NOT EXISTS ir_posts_text_hash_idx
  ON public.ir_posts(channel_id, text_hash)
  WHERE text_hash IS NOT NULL;

-- The phash scan is per-channel and reads only the fingerprint column.
CREATE INDEX IF NOT EXISTS ir_posts_phash_idx
  ON public.ir_posts(channel_id, phash)
  WHERE phash IS NOT NULL;
