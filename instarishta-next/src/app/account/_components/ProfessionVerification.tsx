'use client';
import { useCallback, useEffect, useState } from 'react';
import { PROFESSIONS, getProfession, type DocType } from '@/lib/professions';
import VerifiedBadge from '@/components/VerifiedBadge';

interface VerificationRequest {
  id: string;
  profession_key: string;
  doc_type: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const DOC_LABELS: Record<DocType, string> = {
  registration_no:    'Council registration number',
  membership_no:      'Membership number',
  degree_certificate: 'Degree certificate',
  employment_letter:  'Employment / posting letter',
  corporate_email:    'Company or alumni email',
  other:              'Other proof',
};

/**
 * Apply for a verified profession, and see where that application stands.
 *
 * Three states, and the middle one matters most:
 *   approved  → the badge, and nothing else to do
 *   pending   → under review, no badge yet, cannot re-apply
 *   rejected  → the reason, shown plainly, and the form again
 *
 * Showing the rejection reason back to the applicant is the point. A gate
 * where rejections are silent reads as a broken app; one that says "the
 * registration number did not match NMC records" reads as a gate that is
 * actually being enforced — which is what makes the badge worth having.
 */
export default function ProfessionVerification() {
  const [loading, setLoading]   = useState(true);
  const [verified, setVerified] = useState<string | null>(null);
  const [request, setRequest]   = useState<VerificationRequest | null>(null);

  const [professionKey, setProfessionKey] = useState('');
  const [docType, setDocType]             = useState<DocType | ''>('');
  const [docReference, setDocReference]   = useState('');
  const [note, setNote]                   = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/verification');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVerified(data.professionKey ?? null);
        setRequest(data.request ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const profession = getProfession(professionKey);

  // Reset the proof type whenever the profession changes — the accepted
  // types differ per profession, and a stale selection would fail server-side
  // validation with a confusing message.
  const chooseProfession = (key: string) => {
    setProfessionKey(key);
    setDocType('');
    setError(null);
  };

  const submit = async () => {
    if (!professionKey || !docType || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionKey, docType, docReference, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not submit'); return; }
      setRequest(data.request);
      setDocReference('');
      setNote('');
    } catch {
      setError('Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const card = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  } as const;

  // ── Approved ────────────────────────────────────────────────
  if (verified) {
    return (
      <div className="rounded-2xl p-4" style={card}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">Profession</span>
          <VerifiedBadge professionKey={verified} size="md" />
        </div>
        <p className="mt-2 text-xs text-white/50">
          Verified by InstaRishta. Members can see this badge on your profile and stories.
        </p>
      </div>
    );
  }

  // ── Pending ─────────────────────────────────────────────────
  if (request?.status === 'pending') {
    return (
      <div className="rounded-2xl p-4" style={card}>
        <span className="text-sm font-semibold text-white">Profession</span>
        <p className="mt-2 text-sm text-white/70">
          Your application to verify as{' '}
          <strong className="text-white">{getProfession(request.profession_key)?.label}</strong>{' '}
          is under review.
        </p>
        <p className="mt-1 text-xs text-white/40">
          A person reviews every application, so this is not instant. You will see the
          result here.
        </p>
      </div>
    );
  }

  // ── Rejected, or never applied ──────────────────────────────
  return (
    <div className="rounded-2xl p-4" style={card}>
      <span className="text-sm font-semibold text-white">Get verified</span>

      {request?.status === 'rejected' && (
        <div className="mt-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.3)' }}>
          <p className="text-xs font-semibold" style={{ color: '#FF6B6B' }}>
            Your last application was not approved
          </p>
          {request.reject_reason && (
            <p className="mt-1 text-xs text-white/70">{request.reject_reason}</p>
          )}
          <p className="mt-1 text-xs text-white/40">You can apply again below.</p>
        </div>
      )}

      <p className="mt-2 text-xs text-white/50">
        InstaRishta only verifies professions we can actually check. Choose yours and
        give us the credential to check it against.
      </p>

      {/* Profession */}
      <div className="mt-3 flex flex-wrap gap-2">
        {PROFESSIONS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => chooseProfession(p.key)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer"
            style={{
              background: professionKey === p.key ? 'rgba(0,168,107,0.18)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${professionKey === p.key ? 'rgba(0,168,107,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: professionKey === p.key ? '#00A86B' : 'rgba(255,255,255,0.75)',
            }}
          >
            <span aria-hidden>{p.icon}</span> {p.label}
          </button>
        ))}
      </div>

      {profession && (
        <>
          <p className="mt-3 text-xs text-white/60">{profession.proofHint}</p>

          {/* Proof type — only what this profession accepts */}
          <div className="mt-2 flex flex-wrap gap-2">
            {profession.accepts.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDocType(d)}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                style={{
                  background: docType === d ? 'rgba(0,168,107,0.18)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${docType === d ? 'rgba(0,168,107,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: docType === d ? '#00A86B' : 'rgba(255,255,255,0.7)',
                }}
              >
                {DOC_LABELS[d]}
              </button>
            ))}
          </div>

          <input
            value={docReference}
            onChange={e => setDocReference(e.target.value)}
            placeholder="Registration / membership number"
            maxLength={120}
            className="mt-3 w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          />

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything else that helps us verify you (optional)"
            rows={2}
            maxLength={1000}
            className="mt-2 w-full resize-none rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          />

          {error && <p className="mt-2 text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!docType || !docReference.trim() || submitting}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#00A86B', border: 'none' }}
          >
            {submitting ? 'Submitting…' : 'Apply for verification'}
          </button>

          <p className="mt-2 text-xs text-white/35">
            Not every application is approved. We check the credential before the badge
            appears.
          </p>
        </>
      )}
    </div>
  );
}
