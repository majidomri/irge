'use client';
/**
 * Messaging — SMS and RCS through the DLT registry.
 *
 * The sections follow the order work actually happens in: set up the entity
 * and senders, register the approved templates, prove each one on a test
 * phone, then run campaigns and watch the receipts come back.
 *
 * The mode and provider are shown above every section, not just on Overview,
 * because the one mistake worth designing against is not knowing whether the
 * button in front of you reaches real phones.
 */
import { useCallback, useEffect, useState } from 'react';
import { AMBER, BORDER, FAINT, GREEN, GREEN_BG, MUTED } from '../theme';
import { api, type Toast } from './ui';
import OverviewPanel, { type Overview } from './OverviewPanel';
import SetupPanel from './SetupPanel';
import TemplatesPanel from './TemplatesPanel';
import TestPanel from './TestPanel';
import CampaignsPanel from './CampaignsPanel';
import LogPanel from './LogPanel';
import ImportsPanel from './ImportsPanel';
import AudiencePanel from './AudiencePanel';

type Section = 'overview' | 'setup' | 'templates' | 'test' | 'campaigns' | 'log' | 'imports' | 'audience';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview',  label: 'Overview' },
  { key: 'setup',     label: 'Setup' },
  { key: 'templates', label: 'Templates' },
  { key: 'test',      label: 'Test send' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'log',       label: 'Log' },
  { key: 'imports',   label: 'Import reports' },
  { key: 'audience',  label: 'Audience & opt-outs' },
];

export default function MessagingTab({ toast }: { toast: Toast }) {
  const [section, setSection] = useState<Section>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);

  const refresh = useCallback(async () => {
    const r = await api<Overview>('/api/admin/messaging/overview');
    if (r.ok) setOverview(r.data);
    else toast(r.data.error ?? 'Could not load messaging overview');
  }, [toast]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await api<Overview>('/api/admin/messaging/overview');
      if (live && r.ok) setOverview(r.data);
    })();
    return () => { live = false; };
  }, []);

  const live = overview?.settings.mode === 'live';
  const sandbox = overview ? !overview.provider.reachesPhones : false;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {overview && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 999, fontWeight: 700,
            border: `1px solid ${live ? GREEN : AMBER}`, color: live ? GREEN : AMBER,
          }}>
            {live ? '● LIVE mode' : '● TEST mode — test numbers only'}
          </span>
          <span style={{ color: sandbox ? AMBER : MUTED }}>
            Provider: <strong>{overview.provider.label}</strong>
            {overview.provider.ready ? '' : ' · not ready'}
          </span>
        </div>
      )}

      <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
        {SECTIONS.map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap',
            border: 'none', cursor: 'pointer',
            background: section === s.key ? GREEN_BG : 'transparent',
            color: section === s.key ? GREEN : FAINT,
          }}>{s.label}</button>
        ))}
      </nav>

      {section === 'overview'  && <OverviewPanel data={overview} onRefresh={refresh} go={setSection} />}
      {section === 'setup'     && <SetupPanel toast={toast} onChange={refresh} />}
      {section === 'templates' && <TemplatesPanel toast={toast} onChange={refresh} />}
      {section === 'test'      && <TestPanel toast={toast} overview={overview} />}
      {section === 'campaigns' && <CampaignsPanel toast={toast} overview={overview} onChange={refresh} />}
      {section === 'log'       && <LogPanel toast={toast} />}
      {section === 'imports'   && <ImportsPanel toast={toast} onChange={refresh} />}
      {section === 'audience'  && <AudiencePanel toast={toast} />}
    </div>
  );
}
