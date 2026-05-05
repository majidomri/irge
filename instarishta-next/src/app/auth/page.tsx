'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import GradientText from '@/components/ui/GradientText';

function AuthPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get('error');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
         style={{ background: '#0a1a14' }}>
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-extrabold mb-3">
          <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={5}>
            InstaRishta
          </GradientText>
        </h1>

        {error ? (
          <>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {error === 'callback_failed'
                ? 'Sign-in link expired or already used. Please try again.'
                : 'Something went wrong. Please try again.'}
            </p>
            <button
              onClick={() => router.push('/')}
              className="rounded-full px-8 py-3 font-semibold text-sm"
              style={{ background: '#00A86B', color: '#fff' }}
            >
              Back to home
            </button>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Redirecting…
          </p>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}
