'use client';
import dynamic from 'next/dynamic';

// ssr: false is only allowed in client components in Next.js 16
const EvilEye = dynamic(() => import('./EvilEye'), { ssr: false });
export default EvilEye;
