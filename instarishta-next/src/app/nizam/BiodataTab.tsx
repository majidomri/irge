'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeSections, type BioSection } from '@/lib/biodata-schema';

const PANEL  = '#0f2419';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN  = '#00A86B';
const MUTED  = 'rgba(255,255,255,0.45)';

type SectionType = BioSection['type'];

const TYPE_LABELS: { value: SectionType; label: string; hint: string }[] = [
  { value: 'fields',   label: 'Fields',   hint: 'Label / value pairs in a two-column grid' },
  { value: 'timeline', label: 'Timeline', hint: 'Degree · institution · year entries' },
  { value: 'people',   label: 'People',   hint: 'Family members with avatar initials' },
  { value: 'chips',    label: 'Chips',    hint: 'Short tags, one per line' },
  { value: 'text',     label: 'Text',     hint: 'A single paragraph' },
];

/**
 * Draft shape for the editor. Every section carries all four item shapes so
 * switching type doesn't destroy what was typed — only the active one is
 * serialised on save.
 */
interface Draft {
  heading: string;
  type: SectionType;
  fields: { label: string; value: string }[];
  entries: { title: string; subtitle: string; meta: string }[];
  people: { name: string; role: string; detail: string }[];
  chips: string;
  text: string;
}

const blank = (): Draft => ({
  heading: '', type: 'fields',
  fields: [{ label: '', value: '' }],
  entries: [{ title: '', subtitle: '', meta: '' }],
  people: [{ name: '', role: '', detail: '' }],
  chips: '', text: '',
});

/** Draft → the wire shape the API validates. */
function toSection(d: Draft): Record<string, unknown> {
  switch (d.type) {
    case 'fields':   return { heading: d.heading, type: 'fields',   items: d.fields };
    case 'timeline': return { heading: d.heading, type: 'timeline', items: d.entries };
    case 'people':   return { heading: d.heading, type: 'people',   items: d.people };
    case 'chips':    return { heading: d.heading, type: 'chips',    items: d.chips.split('\n') };
    case 'text':     return { heading: d.heading, type: 'text',     text: d.text };
  }
}

/** Stored section → draft, so an existing record can be edited in place. */
function toDraft(s: BioSection): Draft {
  const d = blank();
  d.heading = s.heading;
  d.type = s.type;
  if (s.type === 'fields')   d.fields  = s.items.map(f => ({ label: f.label, value: f.value }));
  if (s.type === 'timeline') d.entries = s.items.map(e => ({ title: e.title, subtitle: e.subtitle ?? '', meta: e.meta ?? '' }));
  if (s.type === 'people')   d.people  = s.items.map(p => ({ name: p.name, role: p.role ?? '', detail: p.detail ?? '' }));
  if (s.type === 'chips')    d.chips   = s.items.join('\n');
  if (s.type === 'text')     d.text    = s.text;
  return d;
}

interface Row { profile_id: number; sections: BioSection[]; updated_at: string; updated_by: string | null }
interface FeedProfile { id?: number; num: number; title: string; body: string; gender: string }

export default function BiodataTab({ toast }: { toast: (m: string) => void }) {
  const [rows,     setRows]     = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<FeedProfile[]>([]);
  const [search,   setSearch]   = useState('');
  const [editing,  setEditing]  = useState<number | null>(null);
  const [drafts,   setDrafts]   = useState<Draft[]>([blank()]);
  const [busy,     setBusy]     = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/biodata');
    if (res.ok) setRows((await res.json()).biodata ?? []);
  }, []);

  // Initial fetches settle state from a promise callback rather than calling
  // load() straight from the effect body, which reads as a synchronous setState.
  useEffect(() => {
    fetch('/api/admin/biodata')
      .then(r => (r.ok ? r.json() : { biodata: [] }))
      .then(d => setRows(d.biodata ?? []))
      .catch(() => {});
  }, []);

  // The feed is the source of profile ids, so the picker searches it directly
  // rather than making the admin remember IR numbers.
  useEffect(() => {
    fetch('/api/admin/profiles-list')
      .then(r => (r.ok ? r.json() : { profiles: [] }))
      .then(d => setProfiles(d.profiles ?? []))
      .catch(() => {});
  }, []);

  const authored = useMemo(() => new Set(rows.map(r => r.profile_id)), [rows]);

  // Records are keyed by feed id, but the admin thinks in the IR numbers the
  // public site shows. Translate for display so the two never get confused.
  const numById = useMemo(
    () => new Map(profiles.map(p => [p.id!, p.num])),
    [profiles],
  );
  const label = (id: number) => (numById.has(id) ? `IR #${numById.get(id)}` : `id ${id}`);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 40);
    return profiles
      .filter(p => String(p.num) === q || String(p.id).includes(q)
                || p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q))
      .slice(0, 40);
  }, [profiles, search]);

  function edit(profileId: number) {
    const existing = rows.find(r => r.profile_id === profileId);
    setEditing(profileId);
    setDrafts(existing?.sections.length ? existing.sections.map(toDraft) : [blank()]);
  }

  async function save() {
    if (editing == null) return;
    const sections = drafts.map(toSection);
    // Same normaliser the API and renderer use — check here so the admin sees
    // the problem before a round-trip.
    if (!normalizeSections(sections).length) {
      toast('Nothing to save — each section needs a heading and one filled item');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/biodata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: editing, sections }),
    });
    setBusy(false);
    if (!res.ok) { toast((await res.json().catch(() => ({}))).error ?? 'Save failed'); return; }
    await load();
    setEditing(null);
    toast('Biodata saved ✓');
  }

  async function remove(profileId: number) {
    if (!confirm(`Delete the biodata for ${label(profileId)} (id ${profileId})? The profile falls back to auto-extracted fields.`)) return;
    const res = await fetch(`/api/admin/biodata?profile_id=${profileId}`, { method: 'DELETE' });
    if (res.ok) { setRows(prev => prev.filter(r => r.profile_id !== profileId)); toast('Deleted'); }
    else toast('Delete failed');
  }

  const upd = (i: number, patch: Partial<Draft>) =>
    setDrafts(prev => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <>
      <h1 className="text-[1.4rem] font-bold mb-1">Biodata</h1>
      <p className="text-xs mb-6" style={{ color: MUTED }}>
        Hand-authored biodata overrides the auto-extracted fields. Profiles without a
        record here keep showing whatever the extractor finds in the ad text.
      </p>

      {editing == null ? (
        <>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by IR number, feed id, or ad text…"
            className="w-full rounded-xl px-4 py-2.5 text-sm mb-4 outline-none"
            style={{ background: PANEL, border: `1px solid ${BORDER}`, color: '#fff' }}
          />

          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: MUTED }}>
            Authored ({rows.length})
          </p>
          <div className="flex flex-col gap-2 mb-8">
            {rows.length === 0 && (
              <p className="text-sm" style={{ color: MUTED }}>None yet — pick a profile below to start.</p>
            )}
            {rows.map(r => (
              <div key={r.profile_id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
                <span className="text-sm font-bold" style={{ color: GREEN }}>{label(r.profile_id)}</span>
                <span className="text-[10px]" style={{ color: MUTED }}>id {r.profile_id}</span>
                <span className="text-xs flex-1" style={{ color: MUTED }}>
                  {r.sections.length} section{r.sections.length === 1 ? '' : 's'}
                  {r.updated_by ? ` · ${r.updated_by}` : ''}
                </span>
                <button onClick={() => edit(r.profile_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(0,168,107,0.14)', color: GREEN }}>Edit</button>
                <button onClick={() => remove(r.profile_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(207,69,0,0.15)', color: '#FF8A50' }}>Delete</button>
              </div>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: MUTED }}>
            Pick a profile {search ? `(${matches.length} matching)` : '(showing first 40)'}
          </p>
          <div className="flex flex-col gap-1.5">
            {matches.map(p => (
              <button key={p.id} onClick={() => edit(p.id!)}
                className="rounded-xl px-4 py-2.5 flex items-center gap-3 text-left"
                style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
                <span className="text-xs font-bold shrink-0" style={{ color: GREEN }}>IR #{p.num}</span>
                <span className="text-[10px] shrink-0" style={{ color: MUTED }}>id {p.id}</span>
                <span className="text-xs truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }} dir="rtl">
                  {p.title}
                </span>
                {authored.has(p.id!) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(0,168,107,0.16)', color: GREEN }}>authored</span>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => setEditing(null)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>← Back</button>
            <span className="text-sm font-bold">Editing {label(editing)}</span>
            <span className="text-xs" style={{ color: MUTED }}>feed id {editing}</span>
          </div>

          <div className="flex flex-col gap-4">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={d.heading}
                    onChange={e => upd(i, { heading: e.target.value })}
                    placeholder="Section heading (e.g. Personal Details)"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, color: '#fff' }}
                  />
                  <select
                    value={d.type}
                    onChange={e => upd(i, { type: e.target.value as SectionType })}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, color: '#fff' }}>
                    {TYPE_LABELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button onClick={() => setDrafts(prev => prev.filter((_, j) => j !== i))}
                    className="text-xs font-bold px-2.5 py-2 rounded-lg"
                    style={{ background: 'rgba(207,69,0,0.15)', color: '#FF8A50' }}>✕</button>
                </div>

                <p className="text-[11px] mb-2" style={{ color: MUTED }}>
                  {TYPE_LABELS.find(t => t.value === d.type)?.hint}
                </p>

                {d.type === 'fields' && (
                  <RepeatRows
                    rows={d.fields}
                    cols={['Label', 'Value']}
                    onChange={fields => upd(i, { fields })}
                    make={() => ({ label: '', value: '' })}
                    keys={['label', 'value']}
                  />
                )}
                {d.type === 'timeline' && (
                  <RepeatRows
                    rows={d.entries}
                    cols={['Degree / title', 'Institution', 'Year']}
                    onChange={entries => upd(i, { entries })}
                    make={() => ({ title: '', subtitle: '', meta: '' })}
                    keys={['title', 'subtitle', 'meta']}
                  />
                )}
                {d.type === 'people' && (
                  <RepeatRows
                    rows={d.people}
                    cols={['Name', 'Role', 'Detail']}
                    onChange={people => upd(i, { people })}
                    make={() => ({ name: '', role: '', detail: '' })}
                    keys={['name', 'role', 'detail']}
                  />
                )}
                {d.type === 'chips' && (
                  <textarea
                    value={d.chips} rows={4}
                    onChange={e => upd(i, { chips: e.target.value })}
                    placeholder={'One tag per line\nEducated\nNamazi'}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                    style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, color: '#fff' }}
                  />
                )}
                {d.type === 'text' && (
                  <textarea
                    value={d.text} rows={4}
                    onChange={e => upd(i, { text: e.target.value })}
                    placeholder="A paragraph of free text"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                    style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, color: '#fff' }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button onClick={() => setDrafts(prev => [...prev, blank()])}
              className="text-sm font-bold px-4 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>+ Add section</button>
            <button onClick={save} disabled={busy}
              className="text-sm font-bold px-5 py-2.5 rounded-xl"
              style={{ background: GREEN, color: '#04150d', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Save biodata'}
            </button>
          </div>

          <p className="text-[11px] mt-3" style={{ color: MUTED }}>
            Empty fields and empty sections are dropped on save — leave anything you
            don&apos;t know blank rather than typing a dash.
          </p>
        </>
      )}
    </>
  );
}

/** Generic repeating row editor shared by the fields / timeline / people types. */
function RepeatRows<T extends Record<string, string>>({ rows, cols, keys, make, onChange }: {
  rows: T[];
  cols: string[];
  keys: (keyof T)[];
  make: () => T;
  onChange: (rows: T[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          {keys.map((k, ci) => (
            <input
              key={String(k)}
              value={row[k]}
              onChange={e => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))}
              placeholder={cols[ci]}
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, color: '#fff' }}
            />
          ))}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="text-xs px-2.5 rounded-lg shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', color: MUTED }}>✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, make()])}
        className="text-xs font-bold self-start px-3 py-1.5 rounded-lg"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}>+ Row</button>
    </div>
  );
}
