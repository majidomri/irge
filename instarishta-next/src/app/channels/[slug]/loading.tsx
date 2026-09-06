/**
 * Streaming fallback for a channel feed.
 *
 * The feed's first screen is server-rendered from Supabase, so on a cache miss
 * there is a real wait before anything paints. This holds the layout — dark
 * header, then the tile grid — so the page does not reflow when posts arrive.
 */
export default function ChannelLoading() {
  return (
    <main style={{ minHeight: '100vh', background: '#0B0B0A' }}>
      <div style={{ padding: '24px 16px 12px' }}>
        <div style={{ height: 26, width: 200, borderRadius: 6, background: 'rgba(255,255,255,0.12)' }} className="animate-pulse" />
        <div style={{ marginTop: 10, height: 14, width: 280, borderRadius: 5, background: 'rgba(255,255,255,0.08)' }} className="animate-pulse" />
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 30, width: 92, flexShrink: 0, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} className="animate-pulse" />
        ))}
      </div>

      {/* Tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, padding: '0 16px 24px' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: 10, background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
        ))}
      </div>
    </main>
  );
}
