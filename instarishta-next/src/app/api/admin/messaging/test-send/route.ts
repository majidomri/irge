/**
 * POST /api/admin/messaging/test-send
 * Body: { templateId, variables: Record<string,string>, phones: string[] }
 *
 * Sends now, to at most five numbers from the Settings test list — never to
 * anyone else, in either mode. See testSend in lib/messaging/dispatch.ts.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { testSend } from '@/lib/messaging/dispatch';

export const runtime = 'nodejs';

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const templateId = String(body.templateId ?? '');
  if (!templateId) return NextResponse.json({ error: 'templateId is required' }, { status: 400 });

  const variables = (body.variables && typeof body.variables === 'object' ? body.variables : {}) as Record<string, string>;
  const phones = Array.isArray(body.phones) ? body.phones.map(String) : [];

  const result = await testSend(db, { templateId, variables, phones, actor: email });
  if (!result.ok) return NextResponse.json({ error: result.problems[0], problems: result.problems }, { status: 400 });
  return NextResponse.json(result);
});
