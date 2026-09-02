import type { ResolvedField, ResolvedSection } from './types';

/**
 * Packing a biodata into broadcast pages.
 *
 * A live frame cannot scroll, so the content is dealt into pages instead.
 * A section is packed FIELD BY FIELD rather than as an indivisible block, so
 * a section too big for the space left does not jump wholesale to the next
 * page and leave a third of this one empty. A section that spills carries
 * its heading over and continues.
 *
 * The numbers are calibrated against BiodataReel's rendered output, measured
 * in the browser rather than estimated. Reference measurements, stage px:
 * Health 242, Deen 289, Birth 148, Education 314, Family 787, Residence 148,
 * Looking for 266. Re-measure whenever the reel's type or rhythm changes.
 *
 * `heading` and `groupLabel` were re-measured for the tiled section heading
 * and the card surface wrapping a labelled group (Parents / Siblings &
 * others): the heading row grew 48px -> 58px (icon tile, delay both), and a
 * carded group grew by 44px over its old flat height (two 20px paddings plus
 * the 16px inner gap replacing 14px), confirmed identically on both groups.
 */

const H = {
  /** Heading line (icon tile + title) plus the gap under it. */
  heading: 60,
  /** A group's sub-heading plus its card surface (padding, border, gap). */
  groupLabel: 89,
  /** One cell of the two-column detail grid: two sit side by side. */
  detailCell: 45,
  /** One badge row in a grid section (family, relatives). */
  personRow: 92,
  /** One stop on a timeline, including the rule beneath it. */
  timelineRow: 140,
  /** A chip block's label and padding, before its rows. */
  chipBase: 88,
  /** One line of chips, three across. */
  chipRow: 72,
  /** A prose block's label and first line. */
  proseBase: 88,
  proseChars: 44,
  proseLine: 50,
  /** Separator plus the gaps either side of it. */
  sectionGap: 45,
  /** Below this much free space, turn the page rather than split. */
  minSplit: 150,
};

function isChip(f: ResolvedField) {
  return f.type === 'tags' || f.type === 'multiselect';
}

/** What one field costs on a page, in the layout its section declares. */
function fieldHeight(section: ResolvedSection, f: ResolvedField): number {
  if (isChip(f) || section.layout === 'tags') {
    return H.chipBase + Math.ceil(f.display.split(' · ').length / 3) * H.chipRow;
  }
  const rows = f.rows?.length ?? 1;
  switch (section.layout) {
    case 'timeline':
      return rows * H.timelineRow;
    case 'grid':
      return rows * H.personRow;
    case 'prose':
      return H.proseBase + Math.ceil(f.display.length / H.proseChars) * H.proseLine;
    default:
      // Two across, so a plain field is half a row.
      return rows * H.detailCell;
  }
}

export function sectionHeight(s: ResolvedSection): number {
  const labels = s.groups.filter((g) => g.label).length * H.groupLabel;
  return H.heading + labels + s.fields.reduce((n, f) => n + fieldHeight(s, f), 0);
}

/** A section carrying only some of its fields, for a page it is split across. */
function slice(s: ResolvedSection, fields: ResolvedField[]): ResolvedSection {
  const groups: ResolvedSection['groups'] = [];
  for (const f of fields) {
    const found = groups.find((g) => g.label === f.group);
    if (found) found.fields.push(f);
    else groups.push({ label: f.group, fields: [f] });
  }
  return { ...s, fields, groups };
}

/**
 * Greedy packing that fills each page before starting the next, splitting a
 * section when only part of it fits and the space left is worth using.
 */
export function paginate(sections: ResolvedSection[], budget: number): ResolvedSection[][] {
  const pages: ResolvedSection[][] = [];
  let page: ResolvedSection[] = [];
  let used = 0;

  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };

  for (const section of sections) {
    let pending = section.fields;

    while (pending.length) {
      const gap = page.length ? H.sectionGap : 0;
      const free = budget - used - gap;
      const overhead = H.heading + (pending[0].group ? H.groupLabel : 0);

      // Not even a heading and one field fits here: turn the page.
      if (page.length && (free < H.minSplit || free < overhead + fieldHeight(section, pending[0]))) {
        flush();
        continue;
      }

      const take: ResolvedField[] = [];
      let height = H.heading;
      let lastGroup: string | undefined;

      for (const f of pending) {
        const label = f.group && f.group !== lastGroup ? H.groupLabel : 0;
        const cost = fieldHeight(section, f) + label;
        // Always take at least one, or a field taller than a page loops.
        if (take.length && height + cost > free) break;
        height += cost;
        lastGroup = f.group;
        take.push(f);
      }

      page.push(slice(section, take));
      used += gap + height;
      pending = pending.slice(take.length);

      // Whatever is left of this section continues on the next page.
      if (pending.length) flush();
    }
  }

  flush();
  return pages.length ? pages : [[]];
}
