/**
 * /api/admin/messaging/imports — load Nexus report exports into the log.
 *
 * GET   import history and the latest account summary
 * POST  { filename, text? , base64?, commit }   CSV as text, XLSX as base64.
 *       commit:false previews; commit:true writes. See lib/messaging/imports.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { parseCsv } from '@/lib/messaging/csv';
import { importGrid } from '@/lib/messaging/imports';
import { readFirstSheet } from '@/lib/messaging/xlsx';

export const runtime = 'nodejs';

/** A report of this size is tens of thousands of rows; anything bigger is not one. */
const MAX_BYTES = 8 * 1024 * 1024;

export const GET = withAdmin(async (_req, { db }) => {
  const [imports, settings] = await Promise.all([
    db.from('ir_msg_imports').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('ir_msg_settings').select('provider_balance, provider_rate, provider_summary, provider_summary_at').eq('id', 1).maybeSingle(),
  ]);
  return NextResponse.json({ imports: imports.data ?? [], account: settings.data ?? null });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const filename = String(body.filename ?? 'upload').slice(0, 200);
  let grid: string[][];

  try {
    if (typeof body.base64 === 'string') {
      const buf = Buffer.from(body.base64, 'base64');
      if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 8 MB' }, { status: 413 });
      grid = readFirstSheet(buf);
    } else if (typeof body.text === 'string') {
      if (body.text.length > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 8 MB' }, { status: 413 });
      grid = parseCsv(body.text);
    } else {
      return NextResponse.json({ error: 'Send the file as text (CSV) or base64 (XLSX)' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Could not read the file: ${(e as Error).message}` }, { status: 400 });
  }

  if (grid.length < 2) return NextResponse.json({ error: 'The file has no data rows' }, { status: 400 });

  try {
    const result = await importGrid(db, { grid, filename, actor: email, commit: body.commit === true });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});
