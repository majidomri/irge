-- ============================================================
-- InstaRishta — city and country on ir_posts (idempotent)
-- ============================================================
--
-- 024 gave posts a `state` and nothing else for place, which turned out to be
-- the wrong single column: the rishta ads name a city ("Hyderabad") or a
-- country ("USA", "Australia") far more often than an Indian state, and the
-- importer files an extracted location under whichever it is. With only
-- `state` to write into, 87 of 93 posts landed with no place at all and the
-- feed's location filter matched almost nothing.
--
-- Nullable like the rest of 024's facets: a WhatsApp import knows no place,
-- and NULL there means "cannot answer", not "nowhere".

ALTER TABLE public.ir_posts
  ADD COLUMN IF NOT EXISTS city    TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- The feed filters inside one channel, so both indexes lead with it. Partial,
-- because the faceted rows stay the minority while imports keep arriving.
CREATE INDEX IF NOT EXISTS ir_posts_city_idx
  ON public.ir_posts(channel_id, city)
  WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS ir_posts_country_idx
  ON public.ir_posts(channel_id, country)
  WHERE country IS NOT NULL;
