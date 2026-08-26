-- ============================================================
-- InstaRishta — one view counter, not two (idempotent)
-- ============================================================
--
-- The same post was reporting two different view counts depending on where
-- you looked, because two independent counters were both labelled "views":
--
--   ir_posts.views      incremented by ir_increment_views(), called from
--                       openPost() in the channel feed. In-app opens only.
--                       No dedup — every open counts.
--
--   ir_nano_ids.views   incremented by ir_record_event() below, called from
--                       ViewTracker on the shared-link pages (/p, /post, /s).
--                       Share-link visits only, deduped per IP per 24h.
--
-- A post opened 7 times in the feed and once from a shared link showed "7
-- views" in the app and "1 view" on its own page. Neither number was wrong;
-- they were measuring different things under the same name.
--
-- This makes ir_posts.views / ir_stories.views the single total: a share-link
-- view now increments the entity's counter too, and the slug pages read that
-- instead of the per-slug one. ir_nano_ids.views is kept and still written,
-- because it is the only per-slug breakdown — it answers "how much traffic
-- did THIS share link bring", which the entity total cannot.
--
-- Note the dedup asymmetry that remains: share-link views are deduped per IP
-- per 24h, in-app opens are not. The total is therefore "opens + unique daily
-- link visits". Making the in-app path dedup too would need its own event
-- table and is a separate change.
--
-- Posts only. ir_stories has no `views` column — story views are tracked
-- per-viewer in ir_story_views, which is a different (and better) model, so
-- there is nothing to roll a story view up into.

-- Marker table so one-shot backfills in this and later migrations stay
-- idempotent: re-running the file must not double-count.
CREATE TABLE IF NOT EXISTS public.ir_migration_marks (
  mark       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signature must match the existing function exactly, defaults included —
-- CREATE OR REPLACE cannot remove parameter defaults.
CREATE OR REPLACE FUNCTION public.ir_record_event(
  p_slug       TEXT,
  p_event_type TEXT,
  p_source     TEXT DEFAULT NULL::TEXT,
  p_ip_hash    TEXT DEFAULT NULL::TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_id   UUID;
BEGIN
  SELECT entity_type, entity_id INTO v_entity_type, v_entity_id
    FROM public.ir_nano_ids WHERE slug = p_slug;
  IF v_entity_type IS NULL THEN RETURN; END IF;

  IF p_event_type = 'view' AND p_ip_hash IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.ir_share_events
      WHERE slug = p_slug AND event_type = 'view' AND ip_hash = p_ip_hash
        AND created_at > now() - INTERVAL '24 hours'
    ) THEN RETURN; END IF;
  END IF;

  INSERT INTO public.ir_share_events (slug, entity_type, event_type, source, ip_hash)
  VALUES (p_slug, v_entity_type, p_event_type, p_source, p_ip_hash);

  IF p_event_type = 'view' THEN
    UPDATE public.ir_nano_ids SET views = views + 1 WHERE slug = p_slug;

    -- Roll the same view up onto the entity, so the count shown in the feed
    -- and the count shown on the shared page are the same number.
    IF v_entity_type = 'post' THEN
      UPDATE public.ir_posts SET views = COALESCE(views, 0) + 1 WHERE id = v_entity_id;
    END IF;

  ELSIF p_event_type IN ('share','referral') THEN
    UPDATE public.ir_nano_ids SET shares = shares + 1 WHERE slug = p_slug;
  END IF;
END;
$$;

-- Backfill: fold the share-link views already counted on each slug into its
-- entity, so existing posts start from a correct total rather than silently
-- dropping the link traffic they have already had. Runs once — guarded by a
-- marker row so re-applying this migration cannot double-count.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ir_migration_marks WHERE mark = '021_view_backfill') THEN
    UPDATE public.ir_posts p
       SET views = COALESCE(p.views, 0) + n.views
      FROM public.ir_nano_ids n
     WHERE n.entity_type = 'post' AND n.entity_id = p.id AND n.views > 0;

    INSERT INTO public.ir_migration_marks (mark) VALUES ('021_view_backfill');
  END IF;
END $$;
