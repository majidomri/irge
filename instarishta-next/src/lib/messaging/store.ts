/**
 * Reads the messaging tables, typed. Server-only: service-role client.
 */
import 'server-only';

import type { AdminDb } from '@/lib/admin-route';
import type { Sender, Settings, Template } from './types';

export async function loadSettings(db: AdminDb): Promise<Settings> {
  const { data, error } = await db.from('ir_msg_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(`settings: ${error.message}`);
  // The migration seeds the row; this default only matters on a fresh database
  // where it somehow did not run, and it is the most restrictive shape.
  return (data as Settings | null) ?? {
    dlt_entity_id: null, mode: 'test', test_numbers: [], sms_enabled: false, rcs_enabled: false,
    promo_window_start: 9, promo_window_end: 21, daily_cap: 0, updated_by: null, updated_at: new Date().toISOString(),
  };
}

export async function loadTemplate(db: AdminDb, id: string): Promise<{ template: Template; sender: Sender | null } | null> {
  const { data, error } = await db.from('ir_msg_templates').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const template = data as Template;
  let sender: Sender | null = null;
  if (template.sender_id) {
    const { data: s } = await db.from('ir_msg_senders').select('*').eq('id', template.sender_id).maybeSingle();
    sender = (s as Sender | null) ?? null;
  }
  return { template, sender };
}

export async function loadOptouts(db: AdminDb, phones?: string[]): Promise<Set<string>> {
  let q = db.from('ir_msg_optouts').select('phone');
  if (phones) {
    if (phones.length === 0) return new Set();
    q = q.in('phone', phones);
  }
  const { data } = await q;
  return new Set((data ?? []).map((r: { phone: string }) => r.phone));
}

export interface AudienceMember {
  email:          string;
  name:           string | null;
  phone:          string | null;
  phone_verified: boolean;
  rcs_consent:    boolean;
  consent_at:     string | null;
  plan:           string | null;
}

/**
 * Every member with the two facts that decide whether they can be messaged.
 *
 * `rcs_consent` is the member's marketing opt-in from /account. The column
 * predates SMS here, but the toggle's own wording covers "RCS, SMS or
 * WhatsApp", so it is the consent for both channels.
 */
export async function loadMembers(db: AdminDb): Promise<AudienceMember[]> {
  const { data, error } = await db.rpc('ir_rcs_audience');
  if (error) throw new Error(`audience: ${error.message}`);
  return (data ?? []) as AudienceMember[];
}
