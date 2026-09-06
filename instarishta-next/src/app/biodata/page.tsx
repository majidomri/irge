'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const WORKER = 'https://instarishta-profile-relay.instarishtalead.workers.dev/api/submit-profile-ad';

export default function BiodataPage() {
  const formRef  = useRef<HTMLFormElement>(null);
  // Stamped on mount rather than during render. Date.now() is impure, and
  // useRef re-evaluated it on every render only to discard the result. For a
  // spam trap measuring how long the form was open, a few milliseconds later
  // is the same number.
  const openedAt = useRef(0);
  useEffect(() => { openedAt.current = Date.now(); }, []);
  const [busy,    setBusy]    = useState(false);
  const [status,  setStatus]  = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string ?? '').trim();

    const bioData = [
      `Gender: ${get('gender')}`,
      `Age: ${get('age')}`,
      `City: ${get('city')}`,
      `Nationality: ${get('nationality')}`,
      `Mother Tongue: ${get('mother_tongue')}`,
      `Education: ${get('education')}`,
      `Occupation: ${get('occupation')}`,
      `Income: ${get('income')}`,
      `Sect: ${get('sect')}`,
      `Maslak: ${get('maslak')}`,
      `Quran: ${get('hafiz')}`,
      `Guardian: ${get('wali_name')}`,
      ``,
      get('about'),
    ].join('\n');

    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(WORKER, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        get('full_name'),
          phone:       get('contact'),
          whatsapp:    get('whatsapp'),
          bioData,
          formOpenedAt: openedAt.current,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (json.ok) {
        setStatus({ ok: true, msg: 'JazakAllah Khair! Your biodata has been submitted. We will review and contact you shortly.' });
        formRef.current?.reset();
        openedAt.current = Date.now();
      } else {
        setStatus({ ok: false, msg: json.error ?? 'Submission failed. Please try again.' });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error. Please check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>← Back to Home</Link>

        <div className="bg-white rounded-[16px] p-10 md:p-12" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Submit Your Bio Data</h1>
          <p className="text-sm mb-10" style={{ color: '#696969' }}>Fill in the details below. Your profile will be reviewed before publishing.</p>

          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            {/* Personal */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Personal Details</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name"     name="full_name"    type="text"   placeholder="Your full name" required />
                <Field label="Age"           name="age"          type="number" placeholder="25" />
                <Field label="Gender"        name="gender"       type="select" options={['Select', 'Bride (Female)', 'Groom (Male)']} />
                <Field label="City"          name="city"         type="text"   placeholder="Hyderabad" />
                <Field label="Nationality"   name="nationality"  type="text"   placeholder="Indian" />
                <Field label="Mother Tongue" name="mother_tongue"type="text"   placeholder="Urdu" />
              </div>
            </fieldset>

            {/* Education & Career */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Education & Career</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Education"          name="education"  type="text" placeholder="MBBS, B.Tech, MBA…" />
                <Field label="Occupation"         name="occupation" type="text" placeholder="Software Engineer" />
                <Field label="Annual Income (₹)"  name="income"     type="text" placeholder="6 LPA" />
              </div>
            </fieldset>

            {/* Religious */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Religious Background</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sect / School"     name="sect"   type="text"   placeholder="Sunni, Deobandi…" />
                <Field label="Maslak"            name="maslak" type="text"   placeholder="Hanafi" />
                <Field label="Quran Memorised?"  name="hafiz"  type="select" options={['No', 'Partial Hifz', 'Full Hafiz/Hafiza']} />
              </div>
            </fieldset>

            {/* About */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.06em] mb-2" style={{ color: '#696969' }}>About Yourself</label>
              <textarea
                name="about"
                rows={4}
                placeholder="A brief description of yourself and what you are looking for…"
                className="w-full rounded-[10px] border px-4 py-3 text-sm resize-none outline-none"
                style={{ borderColor: '#D1CDC7', color: '#141413', background: '#FCFBFA' }}
              />
            </div>

            {/* Contact */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Family Contact</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Guardian / Wali Name" name="wali_name" type="text" placeholder="Father's or Brother's name" />
                <Field label="Contact Number"        name="contact"   type="tel"  placeholder="+91 98765 43210" required />
                <Field label="WhatsApp Number"       name="whatsapp"  type="tel"  placeholder="+91 98765 43210" required />
              </div>
            </fieldset>

            {status && (
              <div
                className="rounded-[10px] px-4 py-3 text-sm font-medium"
                style={{
                  background: status.ok ? '#EEF6F0' : '#FEF2F2',
                  color:      status.ok ? '#00754A' : '#DC2626',
                  border:     `1px solid ${status.ok ? '#D7EDE5' : '#FECACA'}`,
                }}
              >
                {status.msg}
              </div>
            )}

            <div className="pt-4 border-t" style={{ borderColor: '#edebe9' }}>
              <p className="text-xs mb-4" style={{ color: '#696969' }}>
                By submitting, you agree to our{' '}
                <Link href="/disclaimer" className="font-semibold no-underline" style={{ color: '#00754A' }}>Disclaimer & User Agreement</Link>.
              </p>
              <button
                type="submit"
                disabled={busy}
                className="btn-brand w-full md:w-auto"
                style={{ opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {busy ? 'Sending…' : 'Submit Bio Data'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder, options, required }: {
  label: string; name: string; type: string; placeholder?: string; options?: string[]; required?: boolean;
}) {
  const base  = "w-full rounded-[10px] border px-4 py-3 text-sm outline-none font-medium";
  const style = { borderColor: '#D1CDC7', color: '#141413', background: '#FCFBFA' };

  if (type === 'select') {
    return (
      <div>
        <label className="block text-xs font-bold uppercase tracking-[0.06em] mb-2" style={{ color: '#696969' }}>{label}</label>
        <select name={name} className={base} style={style}>
          {options?.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-[0.06em] mb-2" style={{ color: '#696969' }}>{label}</label>
      <input type={type} name={name} placeholder={placeholder} required={required} className={base} style={style} />
    </div>
  );
}
