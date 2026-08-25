-- ============================================================
-- InstaRishta — Widen ir_comments.chip_key vocabulary (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run.
-- ============================================================
--
-- Migration 010 pinned chip_key to the original four keys:
--   interested, view_profile, is_done, answer_asap
--
-- src/lib/comment-chips.ts now carries ten, covering the intents the
-- mainstream matrimony platforms have settled on (send interest, shortlist,
-- request details, follow up, decline courteously) plus two specific to a
-- nikah context (elders/wali introduction, practice of deen). The four
-- original keys are unchanged, so every existing row stays valid — this
-- only widens what is accepted going forward.
--
-- The CHECK stays a CHECK rather than becoming an enum or lookup table: the
-- vocabulary is small, versioned in git next to the labels it renders, and
-- the constraint is the last line of defence behind isCommentChipKey() in
-- /api/comments. An unknown key must fail loudly at the database, not land
-- as a row the UI cannot render.

ALTER TABLE public.ir_comments
  DROP CONSTRAINT IF EXISTS ir_comments_chip_key_check;

ALTER TABLE public.ir_comments
  ADD CONSTRAINT ir_comments_chip_key_check CHECK (chip_key IN (
    'interested',
    'view_profile',
    'shortlisted',
    'family_details',
    'education_work',
    'deen_practice',
    'wali_contact',
    'is_done',
    'answer_asap',
    'not_a_match'
  ));

-- ============================================================
-- Done. No app restart needed — the constraint is checked per INSERT.
-- ============================================================
