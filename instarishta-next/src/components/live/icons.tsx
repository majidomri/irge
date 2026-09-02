import { HeightIcon } from '@/components/biodata/HeightIcon';
import { RingsIcon } from '@/components/biodata/RingsIcon';
import {
  BookOpen, Briefcase, CalendarDays, Cigarette, Clock, Droplet, GraduationCap,
  Heart, HeartHandshake, Home, Image as ImageIcon, Map, MapPin, Palette,
  PersonStanding, Phone, Quote, Scaling, Search, Sparkles, Star, User,
  UserRound, Users, Users2, Utensils, Wine,
} from 'lucide-react';

/** WhatsApp brand glyph, used on the share affordance. */
export const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 448 512" fill="currentColor" {...props}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 110.9L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
  </svg>
);

/** Crescent and star -- the mark for maslak and deen observance. */
export const CrescentIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
       strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17.4 17.6A7.5 7.5 0 1 1 14 3.9a6 6 0 1 0 3.4 13.7z" />
    <path d="m19.5 6.2.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
  </svg>
);

/** Masjid silhouette -- dome, arch and minarets. Used for namaz and darga. */
export const MosqueIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
       strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2.5c2.2 1.8 3.4 3.5 3.4 5.2 0 1.2-.7 2.1-1.6 2.8h-3.6c-.9-.7-1.6-1.6-1.6-2.8 0-1.7 1.2-3.4 3.4-5.2z" />
    <path d="M5 21v-8.2c0-1.3 1-2.3 2.3-2.3h9.4c1.3 0 2.3 1 2.3 2.3V21" />
    <path d="M10 21v-3a2 2 0 1 1 4 0v3" />
    <path d="M3 21V11m18 10V11" />
    <path d="M3 21h18" />
  </svg>
);


/**
 * One glyph per field. Where the RishtaSwipe card already had a pairing it is
 * kept (work is a briefcase, birth place a map); the deen fields use the
 * crescent and the masjid drawn above.
 */
export const FIELD_ICONS = {
  age: CalendarDays,
  height: HeightIcon,
  complexion: Palette,
  community: Users,
  maslak: CrescentIcon,
  namaz: MosqueIcon,
  hijab: Sparkles,
  beard: UserRound,
  deeni: BookOpen,
  status: RingsIcon,
  diet: Utensils,
  blood: Droplet,
  work: Briefcase,
  education: GraduationCap,
  build: PersonStanding,
  birthplace: Map,
  birthtime: Clock,
  address: MapPin,
  darga: MosqueIcon,
  smoking: Cigarette,
  drinking: Wine,
  sibling: Users2,

  /* Keys the registry uses that the show did not previously need. Every
     registry icon must resolve to something, or a field silently loses its
     glyph the day someone adds it in the admin. */
  user: User,
  heart: Heart,
  faith: CrescentIcon,
  quran: BookOpen,
  star: Star,
  home: Home,
  family: Users,
  father: UserRound,
  mother: UserRound,
  interests: Sparkles,
  quote: Quote,
  rings: HeartHandshake,
  search: Search,
  phone: Phone,
  photo: ImageIcon,
} as const;

export type FieldIcon = keyof typeof FIELD_ICONS;

/** Safe lookup: an unknown icon key renders no glyph rather than crashing. */
export function fieldIcon(key: string | undefined) {
  if (!key) return null;
  return (FIELD_ICONS as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[key] ?? null;
}
