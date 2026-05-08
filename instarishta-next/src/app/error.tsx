'use client';
// Global error boundary — catches unhandled errors in the root layout
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html><body>
      <div className="flex flex-col items-center justify-center px-4 text-center" style={{ minHeight: '100vh', background: '#fff' }}>
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p className="text-sm mb-6 max-w-xs" style={{ color: '#696969' }}>
          {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
        </p>
        <button onClick={reset} className="rounded-full px-6 py-2.5 text-sm font-bold"
          style={{ background: '#006241', color: '#fff' }}>
          Try again
        </button>
      </div>
    </body></html>
  );
}
