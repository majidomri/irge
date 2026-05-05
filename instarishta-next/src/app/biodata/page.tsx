import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Submit Bio Data' };

export default function BiodataPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>← Back to Home</Link>

        <div className="bg-white rounded-[16px] p-10 md:p-12" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Submit Your Bio Data</h1>
          <p className="text-sm mb-10" style={{ color: '#696969' }}>Fill in the details below. Your profile will be reviewed before publishing.</p>

          <form className="flex flex-col gap-6">
            {/* Personal */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Personal Details</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name"    name="full_name"    type="text"   placeholder="Your full name" />
                <Field label="Age"          name="age"          type="number" placeholder="25" />
                <Field label="Gender"       name="gender"       type="select" options={['Select', 'Bride (Female)', 'Groom (Male)']} />
                <Field label="City"         name="city"         type="text"   placeholder="Hyderabad" />
                <Field label="Nationality"  name="nationality"  type="text"   placeholder="Indian" />
                <Field label="Mother Tongue"name="mother_tongue"type="text"   placeholder="Urdu" />
              </div>
            </fieldset>

            {/* Education & Career */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Education & Career</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Education"   name="education"   type="text" placeholder="MBBS, B.Tech, MBA…" />
                <Field label="Occupation"  name="occupation"  type="text" placeholder="Software Engineer" />
                <Field label="Annual Income (₹)" name="income" type="text" placeholder="6 LPA" />
              </div>
            </fieldset>

            {/* Religious */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#00754A' }}>Religious Background</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sect / School"    name="sect"    type="text" placeholder="Sunni, Deobandi…" />
                <Field label="Maslak"           name="maslak"  type="text" placeholder="Hanafi" />
                <Field label="Quran Memorised?" name="hafiz"   type="select" options={['No', 'Partial Hifz', 'Full Hafiz/Hafiza']} />
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
                <Field label="Guardian / Wali Name" name="wali_name"  type="text" placeholder="Father's or Brother's name" />
                <Field label="Contact Number"        name="contact"    type="tel"  placeholder="+91 98765 43210" />
                <Field label="WhatsApp Number"       name="whatsapp"   type="tel"  placeholder="+91 98765 43210" />
              </div>
            </fieldset>

            <div className="pt-4 border-t" style={{ borderColor: '#edebe9' }}>
              <p className="text-xs mb-4" style={{ color: '#696969' }}>
                By submitting, you agree to our{' '}
                <Link href="/disclaimer" className="font-semibold no-underline" style={{ color: '#00754A' }}>Disclaimer & User Agreement</Link>.
              </p>
              <button type="submit" className="btn-brand w-full md:w-auto">Submit Bio Data</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder, options }: {
  label: string; name: string; type: string; placeholder?: string; options?: string[];
}) {
  const base = "w-full rounded-[10px] border px-4 py-3 text-sm outline-none font-medium";
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
      <input type={type} name={name} placeholder={placeholder} className={base} style={style} />
    </div>
  );
}
