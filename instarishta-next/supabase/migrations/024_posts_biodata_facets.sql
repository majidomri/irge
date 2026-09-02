-- ============================================================
-- InstaRishta — filterable facets on ir_posts (idempotent)
-- ============================================================
--
-- /profiles can filter by gender, education, marital status, state,
-- community and age because it reads structured profile records. The channel
-- feed cannot: a post is a picture with a title and a caption, so the only
-- control it has ever been able to offer is a category chip.
--
-- Posts published from the live show are different. They are generated from
-- the biodata registry, so every one of these values is known at publish
-- time and simply had nowhere to go. These columns are that somewhere.
--
-- All nullable, deliberately. The WhatsApp imports have no structured data
-- and never will — nobody is going to hand-key a gender onto four thousand
-- forwarded JPEGs. A NULL here means "this post cannot answer that
-- question", and the feed's filters are written to say so rather than to
-- quietly drop every post that predates them.

ALTER TABLE public.ir_posts
  ADD COLUMN IF NOT EXISTS gender     TEXT,
  ADD COLUMN IF NOT EXISTS age        SMALLINT,
  ADD COLUMN IF NOT EXISTS community  TEXT,
  ADD COLUMN IF NOT EXISTS education  TEXT,
  ADD COLUMN IF NOT EXISTS marital    TEXT,
  ADD COLUMN IF NOT EXISTS state      TEXT,
  ADD COLUMN IF NOT EXISTS is_urgent  BOOLEAN NOT NULL DEFAULT false;

-- The feed always filters within one channel, so every index leads with it.
-- Partial on gender IS NOT NULL: the faceted rows are the minority and will
-- stay the minority for as long as the imports keep arriving.
CREATE INDEX IF NOT EXISTS ir_posts_facets_idx
  ON public.ir_posts(channel_id, gender, age)
  WHERE gender IS NOT NULL;

CREATE INDEX IF NOT EXISTS ir_posts_urgent_idx
  ON public.ir_posts(channel_id)
  WHERE is_urgent;
