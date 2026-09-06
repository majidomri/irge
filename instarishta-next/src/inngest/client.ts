/**
 * The Inngest client, one per app.
 *
 * `id` is permanent. Inngest keys run history and replays off it, so renaming
 * it after a deploy orphans everything that came before — the skill's own
 * config note is emphatic about this, and it is the reason the value was asked
 * for rather than guessed.
 *
 * Env the SDK reads on its own:
 *   INNGEST_DEV=1         → talk to the local dev server on :8288
 *   INNGEST_EVENT_KEY     → required in production to send events
 *   INNGEST_SIGNING_KEY   → required for the route handler to verify that a
 *                           request really came from Inngest Cloud
 *
 * Without the two production keys the route handler still answers, but refuses
 * to run anything — which is the correct failure: an unsigned request must not
 * be able to trigger a job that moves credits.
 */
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'instarishta',
});
