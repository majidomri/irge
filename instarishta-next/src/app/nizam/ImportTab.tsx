'use client';
/**
 * ImportTab — tap-through bulk import of a WhatsApp export folder into ir_posts.
 *
 * The shape is deliberately a story viewer, not a form: one biodata fills the
 * screen, tap the right half to publish, the left half to discard, and the
 * next one is already decoded and waiting. A few hundred images is then a few
 * minutes of thumbing rather than a few hundred trips through a CRUD form.
 *
 * Three things keep it fast:
 *
 *  - Duplicates never reach the thumb. Every image is perceptually hashed in
 *    the browser on load (lib/phash.ts) and repeats are auto-skipped before
 *    the first card renders. A folder that is two-thirds forwards costs
 *    two-thirds fewer taps.
 *  - Uploads are lazy. Nothing is uploaded until it is accepted, so a
 *    discarded image never costs bandwidth or a storage object.
 *  - Writes are batched. Accepted items queue locally and flush every
 *    FLUSH_EVERY, so no tap ever waits on the network.
 *
 * Numbers are flagged, not fixed: captions matching a contact pattern get a
 * badge and can be sent to a "needs redaction" pile with one tap. This screen
 * never edits pixels — triage only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { phashFromFile, hamming, textHash, looksLikeContact, PHASH_THRESHOLD } from '@/lib/phash';

const PANEL  = '#0f2419';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN  = '#00A86B';
const RED    = '#e5484d';
const AMBER  = '#f5a524';
const MUTED  = 'rgba(255,255,255,0.45)';

/** Accepted items per network write. */
const FLUSH_EVERY = 20;

interface Channel { id: string; name: string; is_cohort?: boolean }

type Verdict = 'publish' | 'discard' | 'flag';

interface Item {
  ref:       string;
  file:      File;
  url:       string;        // object URL for preview
  phash:     bigint | null;
  caption:   string;
  textHash:  string | null;
  contact:   boolean;       // caption looks like it carries a phone number
}

interface QueueEntry {
  ref:       string;
  file:      File;
  caption:   string;
  phash:     string | null;
  text_hash: string | null;
  flagged:   boolean;
}

/**
 * WhatsApp exports pair each media file with a line in _chat.txt. Parsing that
 * properly is its own project (locale-dependent timestamps, multi-line
 * messages, RTL), so for now captions come from the sidecar .txt that some
 * exports include, and otherwise stay empty — the image is the biodata.
 */
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

export default function ImportTab({
  channels, toast,
}: { channels: Channel[]; toast: (m: string) => void }) {
  /**
   * Cohorts are never a valid destination: nothing renders posts written to
   * one, so publishing there silently loses the import. /nizam's channel list
   * is unfiltered and newest-first, which used to put a cohort in the default
   * slot — hence this filter rather than a warning.
   */
  const targets = channels.filter(c => !c.is_cohort);

  const [channelId, setChannelId] = useState(targets[0]?.id ?? '');
  const [items,     setItems]     = useState<Item[]>([]);
  const [cursor,    setCursor]    = useState(0);
  const [scanning,  setScanning]  = useState(false);
  const [scanMsg,   setScanMsg]   = useState('');
  const [autoSkipped, setAutoSkipped] = useState(0);
  const [published, setPublished] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [flagged,   setFlagged]   = useState(0);
  const [dupes,     setDupes]     = useState(0);
  const [flushing,  setFlushing]  = useState(false);

  /**
   * The accepted-but-unsaved queue lives in a ref so pushing to it during a
   * tap doesn't re-render the card, but the *count* has to be state — the
   * Finish screen renders a "retry N unsaved" button from it, and a ref read
   * during render would never update that button.
   */
  const queue    = useRef<QueueEntry[]>([]);
  const [pending, setPending] = useState(0);
  const fileRef  = useRef<HTMLInputElement>(null);

  const current = items[cursor];
  const done    = items.length > 0 && cursor >= items.length;

  // Revoke object URLs on unmount — a few hundred decoded images is real memory.
  useEffect(() => () => { items.forEach(i => URL.revokeObjectURL(i.url)); }, [items]);

  /** Hash the picked folder, drop in-batch duplicates, build the deck. */
  const onPick = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).filter(f => IMAGE_RE.test(f.name));
    if (!files.length) { toast('No images in that folder'); return; }

    setScanning(true);
    setAutoSkipped(0);
    const deck: Item[] = [];
    const seen: bigint[] = [];
    let skipped = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setScanMsg(`Hashing ${i + 1} / ${files.length}`);
      // Yield so the progress line actually paints between files.
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));

      const ph = await phashFromFile(file);
      if (ph !== null && seen.some(s => hamming(s, ph) <= PHASH_THRESHOLD)) {
        skipped++;
        continue;
      }
      if (ph !== null) seen.push(ph);

      deck.push({
        ref:      `${file.name}:${file.size}:${i}`,
        file,
        url:      URL.createObjectURL(file),
        phash:    ph,
        caption:  '',
        textHash: null,
        // Caption-based detection only. A number *printed on the image* is
        // invisible to this — that needs OCR, which is not in this screen.
        // The ↑ Flag action is the manual path for those.
        contact:  looksLikeContact(file.name),
      });
    }

    setItems(deck);
    setCursor(0);
    setAutoSkipped(skipped);
    setScanning(false);
    setScanMsg('');
    toast(`${deck.length} to review · ${skipped} duplicates skipped`);
  }, [toast]);

  /** Upload accepted files, then insert them in one batched, dedup-gated call. */
  const flush = useCallback(async (force = false) => {
    if (!queue.current.length) return;
    if (!force && queue.current.length < FLUSH_EVERY) return;

    const batch = queue.current;
    queue.current = [];
    setPending(0);
    setFlushing(true);

    try {
      const uploaded = await Promise.all(batch.map(async entry => {
        const form = new FormData();
        form.append('file', entry.file);
        const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: 'upload failed' }));
          throw new Error(error ?? 'upload failed');
        }
        const { url } = await res.json();
        return {
          ref:     entry.ref,
          image:   url,
          caption: entry.caption || null,
          // Never a title: title is public (card heading, modal heading, image
          // alt text). The flag is private admin state — see migration 020.
          needs_redaction: entry.flagged,
          phash:     entry.phash,
          text_hash: entry.text_hash,
        };
      }));

      const res = await fetch('/api/admin/posts/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ channel_id: channelId, items: uploaded }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'import failed' }));
        throw new Error(error ?? 'import failed');
      }
      const { created, duplicate } = await res.json();
      setPublished(p => p + created);
      setDupes(d => d + duplicate);
      if (duplicate) toast(`${created} published · ${duplicate} already in channel`);
    } catch (e) {
      // Put the batch back so nothing is silently lost. The Finish screen
      // offers a retry for whatever is still queued.
      queue.current = [...batch, ...queue.current];
      setPending(queue.current.length);
      toast(e instanceof Error ? e.message : 'Import failed — batch kept, retry from Finish');
    } finally {
      setFlushing(false);
    }
  }, [channelId, toast]);

  const decide = useCallback(async (verdict: Verdict) => {
    const item = items[cursor];
    if (!item) return;

    if (verdict === 'discard') {
      setDiscarded(d => d + 1);
    } else {
      const th = item.caption ? await textHash(item.caption) : null;
      queue.current.push({
        ref:       item.ref,
        file:      item.file,
        caption:   item.caption,
        phash:     item.phash === null ? null : item.phash.toString(),
        text_hash: th,
        flagged:   verdict === 'flag',
      });
      setPending(queue.current.length);
      if (verdict === 'flag') setFlagged(f => f + 1);
      void flush();
    }

    setCursor(c => c + 1);
  }, [items, cursor, flush]);

  // Flush whatever is left the moment the deck runs out.
  useEffect(() => { if (done) void flush(true); }, [done, flush]);

  // Keyboard: the desktop equivalent of the tap zones.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); void decide('publish'); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); void decide('discard'); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); void decide('flag'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, decide]);

  const progress = items.length ? Math.min(cursor, items.length) / items.length : 0;

  if (targets.length === 0) {
    return <p className="text-sm" style={{ color: MUTED }}>Create a channel first.</p>;
  }

  // ── Picker ────────────────────────────────────────────────────────────────
  if (!items.length) {
    return (
      <>
        <h1 className="text-[1.4rem] font-bold mb-6">Import</h1>
        <div className="rounded-2xl p-6 grid gap-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
          <p className="text-sm font-bold">WhatsApp export → posts</p>
          <p className="text-[13px] leading-relaxed" style={{ color: MUTED }}>
            Pick the media folder from a WhatsApp chat export. Duplicates are detected
            and skipped before you see them — you only tap through what&apos;s actually new.
            Nothing uploads until you publish it.
          </p>

          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm"
            style={{ background: '#0a1a12', border: `1px solid ${BORDER}`, color: '#fff' }}
          >
            {targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={e => void onPick(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning || !channelId}
            className="rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50"
            style={{ background: GREEN, color: '#04150d' }}
          >
            {scanning ? (scanMsg || 'Scanning…') : 'Choose images'}
          </button>

          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            → publish · ← discard · ↑ publish &amp; flag for redaction
          </p>
        </div>
      </>
    );
  }

  // ── Finished ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        <h1 className="text-[1.4rem] font-bold mb-6">Import complete</h1>
        <div className="rounded-2xl p-6 grid gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
          <Stat label="Published"                 value={published} color={GREEN} />
          <Stat label="Flagged for redaction"     value={flagged}   color={AMBER} />
          <Stat label="Discarded"                 value={discarded} color={RED} />
          <Stat label="Duplicates skipped (folder)" value={autoSkipped} color={MUTED} />
          <Stat label="Duplicates skipped (channel)" value={dupes}   color={MUTED} />

          {pending > 0 && (
            <button
              onClick={() => void flush(true)}
              disabled={flushing}
              className="rounded-xl px-4 py-3 text-sm font-bold mt-2 disabled:opacity-50"
              style={{ background: AMBER, color: '#241a04' }}
            >
              {flushing ? 'Retrying…' : `Retry ${pending} unsaved`}
            </button>
          )}

          <button
            onClick={() => { setItems([]); setCursor(0); setPublished(0); setDiscarded(0); setFlagged(0); setDupes(0); setAutoSkipped(0); }}
            className="rounded-xl px-4 py-3 text-sm font-bold mt-1"
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#fff' }}
          >
            Import another folder
          </button>

          {flagged > 0 && (
            <p className="text-[12px] leading-relaxed mt-1" style={{ color: AMBER }}>
              {flagged} post{flagged === 1 ? '' : 's'} marked as needing redaction.
              They are live and look normal to visitors — the flag is admin-only.
              Blur the numbers before promoting any of them to a story.
            </p>
          )}
        </div>
      </>
    );
  }

  // ── Tap-through deck ──────────────────────────────────────────────────────
  return (
    <>
      {/* Destination stays on screen for the whole run. Publishing a few
          hundred biodatas into the wrong channel is tedious to undo, and the
          deck gives no other clue about where they are going. */}
      <p className="text-[12px] mb-2">
        <span style={{ color: MUTED }}>Publishing to </span>
        <span className="font-bold" style={{ color: GREEN }}>
          {targets.find(c => c.id === channelId)?.name ?? '—'}
        </span>
      </p>

      {/* Progress, story-tray style: one segment per remaining decision. */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
          <div className="h-full transition-[width] duration-150" style={{ width: `${progress * 100}%`, background: GREEN }} />
        </div>
        <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>
          {cursor + 1} / {items.length}
        </span>
      </div>

      <div
        className="relative rounded-2xl overflow-hidden select-none"
        style={{ background: '#000', border: `1px solid ${BORDER}`, aspectRatio: '3 / 4', maxHeight: '70vh' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, never optimised */}
        <img
          src={current.url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />

        {current.contact && (
          <div
            className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-bold"
            style={{ background: AMBER, color: '#241a04' }}
          >
            Possible phone number
          </div>
        )}

        {/* Tap zones. Left third discards, right two-thirds publish — the
            common case gets the bigger target. */}
        <button
          aria-label="Discard"
          onClick={() => void decide('discard')}
          className="absolute inset-y-0 left-0 w-1/3"
          style={{ background: 'transparent' }}
        />
        <button
          aria-label="Publish"
          onClick={() => void decide('publish')}
          className="absolute inset-y-0 right-0 w-2/3"
          style={{ background: 'transparent' }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <ActionBtn label="Discard"  hint="←" color={RED}   onClick={() => void decide('discard')} />
        <ActionBtn label="Flag"     hint="↑" color={AMBER} onClick={() => void decide('flag')} />
        <ActionBtn label="Publish"  hint="→" color={GREEN} onClick={() => void decide('publish')} />
      </div>

      <p className="text-[11px] mt-3 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {published} published · {discarded} discarded · {autoSkipped} duplicates skipped
        {flushing && ' · saving…'}
      </p>
    </>
  );
}

function ActionBtn({ label, hint, color, onClick }: { label: string; hint: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl px-3 py-3 text-sm font-bold"
      style={{ background: `${color}1f`, border: `1px solid ${color}55`, color }}
    >
      {label} <span className="opacity-50 font-normal">{hint}</span>
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: MUTED }}>{label}</span>
      <span className="font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
