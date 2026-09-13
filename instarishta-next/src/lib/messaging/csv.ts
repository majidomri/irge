/**
 * CSV in and out. PURE — the browser previews an upload with the same parser
 * the server imports it with.
 *
 * RFC 4180, because Nexus's delivery reports need it: the message column is
 * quoted and contains line breaks (the "\n\nIRSTA" sender footer), so a
 * split-on-newline reader turns one message into three broken rows.
 */

export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

/** Rows as objects keyed by lower-cased, trimmed header. */
export function csvObjects(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  const [head = [], ...body] = rows;
  const headers = head.map(h => h.trim().toLowerCase());
  const records = body.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, records };
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
