'use client';
// Remix pattern: error.tsx = per-route error boundary.
// Catches errors thrown by ProfilesPage (async server component) and its children.
export default function ProfilesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 text-center" style={{ minHeight: '60vh', background: '#fff' }}>
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-lg font-bold mb-2" style={{ color: '#141413' }}>Couldn't load profiles</h2>
      <p className="text-sm mb-6 max-w-xs" style={{ color: '#696969' }}>
        {error.message ?? 'Something went wrong. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="rounded-full px-6 py-2.5 text-sm font-bold"
        style={{ background: '#006241', color: '#fff' }}
      >
        Try again
      </button>
    </div>
  );
}
