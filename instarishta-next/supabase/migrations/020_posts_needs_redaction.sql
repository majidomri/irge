-- ============================================================
-- InstaRishta — move the importer's redaction flag off `title` (idempotent)
-- ============================================================
--
-- The WhatsApp importer's "flag for redaction" action wrote the literal
-- string 'NEEDS REDACTION' into ir_posts.title. title is a *public* field:
-- it renders as the card heading in the channel feed, as the modal heading,
-- and into each image's alt attribute — so an internal triage state was
-- being published to visitors and to screen readers.
--
-- A private workflow state needs its own column. This one is never rendered
-- publicly; it exists so /nizam can filter the pile of posts still waiting
-- for a phone number to be blurred out.

ALTER TABLE public.ir_posts
  ADD COLUMN IF NOT EXISTS needs_redaction BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the flagged set is small and is always queried as
-- "show me what still needs work", never the inverse.
CREATE INDEX IF NOT EXISTS ir_posts_needs_redaction_idx
  ON public.ir_posts(channel_id)
  WHERE needs_redaction;

-- Backfill the rows the importer already mislabelled, then clear the title
-- so it stops rendering. Scoped to imported rows (phash present) so a
-- hand-authored post that happens to use those words is left alone.
UPDATE public.ir_posts
   SET needs_redaction = true,
       title           = NULL
 WHERE title = 'NEEDS REDACTION'
   AND phash IS NOT NULL;
