/**
 * Every tuning knob for the /live broadcast template lives here.
 *
 * The stage is a fixed 1080x1920 (9:16) coordinate space -- the same shape as
 * a phone screen, Reels, Shorts and vertical live. Every position below is in
 * those coordinates, and the whole stage is scaled to fit whatever window it
 * is displayed in, so what you see locally is exactly what gets recorded.
 */

export const STAGE = { width: 1080, height: 1920 } as const;

export const BRAND = {
  /** Rendered in the header lockup and in the full-screen transition. */
  wordmarkA: 'Insta',
  wordmarkB: 'Rishta',
  wordmarkC: '.me',
  tagline: 'Find your rishta, the halal way',
  /** Prefix shown on the end card the viewer searches with. */
  idPrefix: 'IR',
  /** Where a scanned QR lands. Point this at the real profile route. */
  site: 'https://instarishta.me',
} as const;

/** The deep link encoded in the end card's QR code. */
export function profileUrl(irId: string): string {
  return `${BRAND.site}/p/${irId}`;
}

/**
 * A WhatsApp forward with the ID already written.
 *
 * The person who decides on a rishta is usually not the person watching --
 * it is a mother, a khala, a phuppi. So the end card offers the forward, not
 * just the link: scanning opens WhatsApp with the message composed and the
 * viewer only has to pick who to send it to.
 */
export function whatsappShareUrl(irId: string, name: string): string {
  const text = `Rishta ${irId} — ${name}
${profileUrl(irId)}

InstaRishta.me`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Closing card: when the next show is, so viewers come back. */
export const EPISODE = {
  cadence: 'Every Thursday',
  time: '9:00 PM',
  promise: 'New rishtas, every week',
} as const;

/**
 * Palette and surface treatment lifted from the InstaRishta biodata drawer
 * (codepen porPLpr): indigo primary, warm-neutral greys, tinted status pills,
 * icon-grid facts and dashed section rules.
 */
/**
 * Design tokens taken from the production InstaRishta biodata page
 * (Documents/l/biodata.html): navy ink, teal + coral accents, frosted-glass
 * cards, Cormorant Garamond headings over DM Sans body.
 *
 * Sizes in the components are the page's rem values x3, because this stage is
 * a 1080px-wide phone frame (3x a 360px viewport).
 */
/**
 * Design direction: a Deccan nikah invitation rendered for broadcast.
 *
 * Deep aubergine ground with mehndi gold and rose. Dark on purpose -- on a
 * phone stream the portrait and the host's face become the light sources, and
 * the host circle reads as part of the composition instead of pasted onto it.
 * Gold carries structure (rules, the ID); rose carries the human facts.
 */
export const THEME = {
  ground: '#1C0A21',
  ground2: '#150718',
  raise: '#2A1131',
  raise2: '#381B41',
  gold: '#E5B45C',
  goldDim: 'rgba(229, 180, 92, 0.30)',
  goldFaint: 'rgba(229, 180, 92, 0.12)',
  /** Premium foil: a swept metallic gradient, not a different colour. */
  foil: 'linear-gradient(100deg, #C9922F 0%, #F2C97A 22%, #FFF3D0 34%, #F2C97A 46%, #C9922F 70%, #F2C97A 100%)',
  foilLight: '#FFF3D0',
  foilEdge: 'rgba(242, 201, 122, 0.55)',
  rose: '#F0728C',
  roseDim: 'rgba(240, 114, 140, 0.16)',
  cream: '#F7EFE6',
  muted: '#B9A2BE',
  hairline: 'rgba(247, 239, 230, 0.10)',

  /**
   * Typography is instarishta.me's own: Inter for everything, with the site's
   * system mono stack for data. There is no separate display face on the
   * site, so names and the wordmark are Inter at heavier weights and tighter
   * tracking rather than a different family.
   */
  display: "'Inter', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
  sans: "'Inter', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  /** For Arabic script, as the site loads it. */
  arabic: "'Noto Naskh Arabic', serif",
} as const;

/**
 * The stage is divided into bands that never overlap. Content is laid out
 * inside CONTENT only, so nothing can ever end up behind the host circle --
 * the circle has its own band, and the ID rail fills the space beside it.
 */
export const ZONES = {
  header: { y: 0, h: 172 },
  /**
   * Full stage width: the portrait runs edge to edge, and text sections apply
   * their own inset via ZONES.gutter.
   */
  content: { x: 0, y: 186, w: 1080, h: 1338 },
  hostBand: { y: 1546, h: 374 },
  /** Tailwind's pt-20, applied inside the header band. */
  headerPadTop: 80,
  /**
   * The single horizontal inset for every beat -- intro details and each
   * biodata page -- so the left and right margins never differ between steps.
   *
   * Applied by ContentZone OUTSIDE its auto-fit transform, so a page that has
   * to shrink to fit keeps exactly the same margins as one that does not.
   */
  gutter: 40,
  /**
   * The intro's lower third: the band the name, facts and description sit
   * in, as a fraction of the frame. Broadcast graphics live down here so the
   * face above them is never covered.
   */
  lowerThird: 0.45,
  /**
   * The inset each beat carries INSIDE the gutter. The intro's lower third
   * sets it and the biodata pages copy it, so text starts the same distance
   * from the frame edge on every page of the show.
   */
  pagePad: 40,
} as const;

/**
 * Host video panels. Two independent frames, each placed in stage coordinates.
 *
 * `deviceId` lets you bind a different camera to each panel. Leave both
 * undefined and they share the one default webcam (the stream is cached, so
 * the same camera is never opened twice).
 */
export const TIMING = {
  /** Full-screen logo transition, in three phases. Deliberately unhurried --
   *  this is the brand's moment on screen, not just a scene change. */
  stingCoverMs: 820,    // brand sweeps up over the old profile
  stingHoldMs: 1250,    // logo owns the screen
  stingRevealMs: 820,   // sweeps away, new profile behind it
  /** Biodata lines entering one after another. */
  rowStaggerMs: 90,
  rowEnterMs: 520,
  /** How long the IR id card takes to land. */
  endcardEnterMs: 700,
  /** People need time to raise a phone and scan -- the ring tracks it. */
  scanHoldMs: 6000,
} as const;

export type HostPanelConfig = {
  enabled: boolean;
  /** `rect` is square-cornered; `squircle` rounds to 44px. */
  shape: 'squircle' | 'circle' | 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  deviceId?: string;
  mirrored: boolean;
  /** Visible during these beats; omit for "always". */
  beats?: Beat[];
};

export const HOST_PANELS: Record<'bubble' | 'bubbleIntro' | 'bubbleEnd' | 'strip' | 'sting', HostPanelConfig> = {
  /** Lives inside ZONES.hostBand, so content never collides with it. */
  bubble: {
    enabled: true,
    shape: 'circle',
    x: 60,
    y: 1584,
    w: 268,
    h: 268,
    mirrored: true,
  },
  /**
   * Intro beat: beside the profile's name, down in the details block. Full
   * size -- the host is part of the introduction, not a corner ornament.
   */
  bubbleIntro: {
    enabled: true,
    shape: 'circle',
    x: 0, // unused: the intro lays this frame out inline, beside the name
    y: 0,
    w: 300,
    h: 300,
    mirrored: true,
  },
  /**
   * Where the host sits on the closing beat. The bottom band belongs to the
   * biodata while it is on screen; once the ID and QR take over, the host
   * moves up to centre stage and speaks over them. Same camera, so the
   * cached stream just moves -- HostFrame animates left/top between the two.
   */
  bubbleEnd: {
    enabled: true,
    shape: 'circle',
    x: 396,
    y: 128,
    w: 288,
    h: 288,
    mirrored: true,
  },
  /**
   * The biodata beats: a 16:9 strip in the host band, tucked under the gold
   * hairline that closes the content zone.
   *
   * A circle crops a webcam's 16:9 feed to a square and then masks the
   * corners off that, so most of the picture is thrown away. At the same
   * height this strip keeps the whole frame, and it fills the band the
   * layout already reserves for the host instead of using a quarter of it.
   */
  strip: {
    enabled: true,
    shape: 'rect',
    x: 40,
    y: 1584,
    // 16:9 exactly, sized so the name rail beside it still has room to
    // set the name on one line and the place under it on another.
    w: 512,
    h: 288,
    mirrored: true,
  },
  /** The same host, featured large inside the full-screen logo transition. */
  sting: {
    enabled: true,
    shape: 'circle',
    x: 320,
    y: 470,
    w: 440,
    h: 440,
    mirrored: true,
  },
};

/** The beats a single profile segment moves through, in order. */
export const BEATS = ['intro', 'profile', 'endcard'] as const;
export type Beat = (typeof BEATS)[number];

export const BEAT_LABELS: Record<Beat, string> = {
  intro: 'Introduction',
  profile: 'Biodata',
  endcard: 'IR ID call-out',
};

/**
 * Turns a stored profile id into the ID a viewer types into the website.
 * Placeholder ids look like "RS001"; the show calls that "IR-001".
 */
export function toIrId(id: string): string {
  const digits = id.replace(/\D/g, '');
  const body = digits ? digits.padStart(3, '0') : id.toUpperCase();
  return `${BRAND.idPrefix}-${body}`;
}
