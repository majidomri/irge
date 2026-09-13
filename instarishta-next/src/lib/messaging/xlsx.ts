/**
 * Just enough XLSX to read a gateway's report: first sheet, cell values.
 *
 * Nexus exports its account summary as .xlsx. An XLSX is a ZIP of XML, so
 * this reads the ZIP's central directory, inflates the two parts it needs
 * with node's zlib, and pulls cell values out with a regex — no dependency
 * for a two-row sheet. Formulas, styles and dates-as-serials are not
 * interpreted; values come back as the strings stored.
 */
import 'server-only';

import { inflateRawSync } from 'zlib';

function entries(buf: Buffer): Map<string, Buffer> {
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not an XLSX (zip) file');

  const count  = buf.readUInt16LE(eocd + 10);
  let   offset = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method   = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen  = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const cmtLen   = buf.readUInt16LE(offset + 32);
    const local    = buf.readUInt32LE(offset + 42);
    const name     = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    const lName  = buf.readUInt16LE(local + 26);
    const lExtra = buf.readUInt16LE(local + 28);
    const start  = local + 30 + lName + lExtra;
    const data   = buf.subarray(start, start + compSize);
    if (name.startsWith('xl/')) out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));

    offset += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

const unxml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&');

const texts = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** The first worksheet as a grid of strings. */
export function readFirstSheet(buf: Buffer): string[][] {
  const files = entries(buf);
  const sheetName = [...files.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('No worksheet in file');

  const shared = files.get('xl/sharedStrings.xml')?.toString('utf8');
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) : [];

  const xml = files.get(sheetName)!.toString('utf8');
  const grid: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      let value = '';
      if (type === 'inlineStr') value = texts(inner);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        value = type === 's' ? (strings[Number(v)] ?? '') : unxml(v);
      }
      cells[ref ? colIndex(ref) : cells.length] = value;
    }
    grid.push(Array.from(cells, v => v ?? ''));
  }
  return grid;
}
