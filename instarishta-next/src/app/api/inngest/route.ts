/**
 * The endpoint Inngest calls to invoke functions.
 *
 * All three verbs are required: GET for introspection, POST for invocation,
 * PUT for registration on deploy.
 *
 * Adding a function means adding it to src/inngest/functions/index.ts, not
 * here — this file should stay unchanged.
 */
import { serve } from 'inngest/next';

import { inngest } from '@/inngest/client';
import { functions } from '@/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
