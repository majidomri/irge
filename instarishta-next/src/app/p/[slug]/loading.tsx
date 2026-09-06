/**
 * Streaming fallback for a share page.
 *
 * Most visits hit a prerendered file and never see this. It shows on the paths
 * that still render on demand: a slug created since the last build, and the
 * regeneration after `revalidate` expires. The shape matches ProfileView's
 * header so the swap is a fill, not a jump.
 */
export default function ProfileLoading() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9' }}>
      <div style={{ background: '#1E3932', padding: '28px 24px 20px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.62)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            InstaRishta Profile
          </p>
          <div style={{ marginTop: 12, height: 22, width: 180, borderRadius: 6, background: 'rgba(255,255,255,0.14)' }} className="animate-pulse" />
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 14, width: 72, borderRadius: 5, background: '#E8E4E0' }} className="animate-pulse" />
          ))}
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 76, borderRadius: 12, background: '#EFEDEA' }} className="animate-pulse" />
          ))}
        </div>
      </div>
    </main>
  );
}
