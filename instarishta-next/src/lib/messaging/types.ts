/**
 * Row shapes and the provider contract.
 *
 * The provider contract is deliberately small — submit one message, parse one
 * webhook — so that swapping aggregators (or adding a second for failover) is a
 * new file in providers/, not a change to campaigns, compliance or the UI.
 */
import type { Category, Channel, TemplateVariable } from './dlt';
import type { RcsPayload } from '@/lib/rcs/messages';

export interface Settings {
  dlt_entity_id:      string | null;
  mode:               'test' | 'live';
  test_numbers:       string[];
  sms_enabled:        boolean;
  rcs_enabled:        boolean;
  promo_window_start: number;
  promo_window_end:   number;
  daily_cap:          number;
  updated_by:         string | null;
  updated_at:         string;
}

export interface Sender {
  id:            string;
  channel:       Channel;
  sender_code:   string;
  dlt_header_id: string | null;
  category:      Category;
  status:        'pending' | 'approved' | 'rejected' | 'inactive';
  label:         string | null;
  notes:         string | null;
}

export interface Template {
  id:                   string;
  name:                 string;
  channel:              Channel;
  category:             Category;
  sender_id:            string | null;
  dlt_template_id:      string | null;
  provider_template_id: string | null;
  body:                 string;
  variables:            TemplateVariable[];
  rcs_payload:          RcsPayload | null;
  status:               'draft' | 'pending' | 'approved' | 'rejected' | 'paused';
  notes:                string | null;
}

export type MessageStatus =
  | 'queued' | 'submitted' | 'sent' | 'delivered' | 'read'
  | 'failed' | 'unreachable' | 'skipped' | 'dry_run';

export interface MessageRow {
  id:                  string;
  campaign_id:         string | null;
  template_id:         string | null;
  channel:             Channel;
  category:            Category;
  sender_code:         string | null;
  dlt_template_id:     string | null;
  phone:               string;
  email:               string | null;
  body:                string;
  variables:           Record<string, string>;
  status:              MessageStatus;
  mode:                'test' | 'live';
  provider_message_id: string | null;
}

// ── Provider contract ────────────────────────────────────────────────────────

export interface SubmitRequest {
  /** Our row id. Sent as the client reference so receipts find their row. */
  messageId:          string;
  channel:            Channel;
  category:           Category;
  phone:              string;          // E.164
  text:               string;          // fully rendered
  values:             string[];        // slot values, in order
  senderCode:         string | null;
  dltEntityId:        string | null;
  dltTemplateId:      string | null;
  providerTemplateId: string | null;
  rcsPayload:         RcsPayload | null;
}

export type SubmitOutcome =
  | { status: 'submitted';   providerMessageId: string | null }
  | { status: 'unreachable'; error?: string }
  | {
      status: 'failed';
      error:  string;
      code?:  string;
      /**
       * True when every remaining message would fail the same way — bad
       * credentials, rate limit, outage. A campaign stops on these rather than
       * turning one problem into five hundred log rows.
       */
      fatal:  boolean;
    };

export type NormalizedEventType = 'submitted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unreachable' | 'reply' | 'unknown';

export interface NormalizedEvent {
  dedupeKey:         string;
  type:              NormalizedEventType;
  messageId:         string | null;   // our id, when the provider echoes it
  providerMessageId: string | null;
  phone:             string | null;
  text:              string | null;
  error:             string | null;
  raw:               Record<string, unknown>;
}

export interface WebhookInput {
  method:  string;
  headers: Headers;
  query:   URLSearchParams;
  rawBody: string;
}

export interface ProviderReadiness {
  /** Can submit at all. */
  ready:    boolean;
  /** Submitting reaches real phones. False for the sandbox. */
  reachesPhones: boolean;
  missing:  string[];
  notes:    string[];
}

export interface MessagingProvider {
  id:    string;
  label: string;
  readiness(): ProviderReadiness;
  submit(req: SubmitRequest): Promise<SubmitOutcome>;
  /** `authorized: false` → the route answers 403 and stores nothing. */
  parseWebhook(input: WebhookInput): { authorized: boolean; events: NormalizedEvent[] };
  /** Sandbox only: the receipts a real network would send back later. */
  simulateReceipts?(req: SubmitRequest, outcome: SubmitOutcome): NormalizedEvent[];
}
