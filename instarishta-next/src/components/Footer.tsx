import Link from 'next/link';
import { ENTITY, OPERATOR_LINE } from '@/lib/entity';

const FOOTER_LINKS = [
  { href: '/privacy',       label: 'Privacy'       },
  { href: '/toc',           label: 'Terms'         },
  { href: '/disclaimer',    label: 'Disclaimer'    },
  { href: '/security',      label: 'Security'      },
  { href: '/child-safety',  label: 'Child Safety'  },
  { href: '/report',        label: 'Report Abuse'  },
  { href: '/biodata',       label: 'Bio Data'      },
  { href: '/channels',      label: 'Channels'      },
];

export default function Footer() {
  return (
    <footer style={{ background: '#141413' }} className="mt-auto">
      <div className="max-w-[1280px] mx-auto px-6 py-10">
        {/* Top row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-8 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <div>
            <Link href="/" className="text-xl font-extrabold tracking-[-0.02em] text-white no-underline">
              Insta<span style={{ color: '#00754A' }}>Rishta</span>
            </Link>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Trusted Muslim Matrimony & Nikah Matchmaking
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium no-underline transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Operator disclosure — DLT / RCS verifiers look for this on every page. */}
        <div className="pt-6 pb-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.60)' }}>
            {OPERATOR_LINE}
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Registered address: {ENTITY.address} &nbsp;·&nbsp; {ENTITY.supportEmail} &nbsp;·&nbsp; {ENTITY.whatsapp}
          </p>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-6">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            © {new Date().getFullYear()} {ENTITY.shortName}. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Built for the Muslim Ummah · Family-first matchmaking
          </p>
        </div>
      </div>
    </footer>
  );
}
