import Link from 'next/link';
import EvilEye from '@/components/EvilEyeClient';

export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '100vh', background: '#000000' }}
    >
      {/* Eye canvas */}
      <div style={{ width: '100%', maxWidth: 420, height: 320, flexShrink: 0 }}>
        <EvilEye
          eyeColor="#FF6F37"
          intensity={2.4}
          pupilSize={1.7}
          irisWidth={0.25}
          glowIntensity={0.35}
          scale={0.9}
          noiseScale={1}
          pupilFollow={1.8}
          flameSpeed={1.8}
          backgroundColor="#000000"
        />
      </div>

      {/* Text block */}
      <div className="flex flex-col items-center px-6 text-center" style={{ marginTop: 8 }}>
        <p
          className="text-7xl font-extrabold mb-3 tabular-nums"
          style={{ color: '#FF6F37', letterSpacing: '-0.04em', lineHeight: 1 }}
        >
          404
        </p>
        <h1 className="text-xl font-bold mb-2" style={{ color: '#ffffff' }}>
          Page not found
        </h1>
        <p className="text-sm mb-8 max-w-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/profiles"
          className="rounded-full px-7 py-3 text-sm font-bold"
          style={{ background: '#FF6F37', color: '#000', textDecoration: 'none' }}
        >
          Browse Profiles
        </Link>
      </div>
    </div>
  );
}
