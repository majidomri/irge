-- ============================================================
-- InstaRishta — Allow text-only posts (idempotent)
-- ============================================================
--
-- ir_posts.image was NOT NULL while the app already treats a post as valid
-- with just a caption or audio_url (see POST /api/admin/posts: "post must
-- have caption, image, or audio" — image is explicitly optional there) and
-- the post viewer (PostModal, channels/[slug]/page.tsx) already has a full
-- text-only rendering path (`isText = !post.image && !isAudio`). The NOT
-- NULL constraint was the one place still assuming every post has an image,
-- and it silently blocked publishing a caption/audio-only post.

ALTER TABLE public.ir_posts ALTER COLUMN image DROP NOT NULL;
