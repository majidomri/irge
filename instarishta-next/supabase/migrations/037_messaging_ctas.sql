-- Whitelisted CTAs (call-to-action URLs and numbers) from the DLT portal.
--
-- Since TRAI's CTA directive, a commercial SMS containing a URL, APK link or
-- call-back number that is not whitelisted against the sender's entity is
-- blocked by the operator — and, like a template mismatch, the block is silent.
-- So the registry lives next to templates, and the send path refuses text whose
-- links or numbers are not on it (lib/messaging/dlt.ts: ctaViolations).
--
-- Matching is deliberately literal. `www.instarishta.me` and `instarishta.me`
-- are different entries to the scrubber, so they are different entries here.

begin;

create table if not exists public.ir_msg_ctas (
  id          uuid primary key default gen_random_uuid(),
  dlt_cta_id  text        unique,
  name        text        not null,
  cta_type    text        not null check (cta_type in ('url','phone','apk','other')),
  -- static: exactly this value. dynamic: this value as a prefix (DLT's
  -- "Dynamic URL", where the path after it may vary).
  sub_type    text        not null default 'static' check (sub_type in ('static','dynamic')),
  value       text        not null,
  status      text        not null default 'active' check (status in ('active','inactive')),
  notes       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.ir_msg_ctas enable row level security;
drop policy if exists deny_all on public.ir_msg_ctas;
create policy deny_all on public.ir_msg_ctas for all using (false);

drop trigger if exists ir_msg_ctas_touch_trg on public.ir_msg_ctas;
create trigger ir_msg_ctas_touch_trg before update on public.ir_msg_ctas
  for each row execute function public.ir_msg_touch();

commit;
