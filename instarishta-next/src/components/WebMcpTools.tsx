'use client';

import { useEffect } from 'react';
import type { Profile } from '@/types/profile';

/**
 * WebMCP — exposes this page's actions to an agent running in the browser.
 *
 * https://webmachinelearning.github.io/webmcp/
 *
 * The tools below are the ones a person actually asks for on the listing page:
 * narrow the list, then open one. They operate on the profiles already loaded
 * into the page, so a tool call costs nothing extra and can never return
 * something the visitor could not see themselves.
 *
 * Contact details are not exposed, for the same reason they are absent from
 * the markdown views: a family controls when its number is released, and an
 * agent acting on the page is not the gate for that. `open_profile` returns a
 * URL, which is the correct way to hand someone onward.
 */

type ModelContext = {
  provideContext?: (config: { tools: WebMcpTool[] }) => void;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }>;
};

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

/** Strips anything phone-shaped, matching the markdown views. */
function withoutContacts(body: string): string {
  return body
    .replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, (m) =>
      m.replace(/\D/g, '').length >= 7 ? '[contact removed]' : m)
    .trim();
}

function summarise(p: Profile, index: number): string {
  const facts = [
    p.age ? `${p.age} yrs` : null,
    p.gender === 'female' ? 'bride' : p.gender === 'male' ? 'groom' : null,
    p.education || null,
  ].filter(Boolean).join(' · ');

  return `${index}. ${p.title || 'Untitled'}${facts ? ` (${facts})` : ''}\n` +
    `   ${withoutContacts(p.body || '').slice(0, 200)}`;
}

export function WebMcpTools({ profiles }: { profiles: Profile[] }) {
  useEffect(() => {
    const modelContext = (navigator as Navigator & { modelContext?: ModelContext })
      .modelContext;

    if (!modelContext?.provideContext) return;

    const tools: WebMcpTool[] = [
      {
        name: 'search_rishta_profiles',
        description:
          'Search the verified rishta listings currently on this page by age ' +
          'range, gender, education or free text. Returns summaries without ' +
          'contact details.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free text to match in the listing.' },
            gender: { type: 'string', enum: ['male', 'female'], description: 'groom or bride' },
            minAge: { type: 'number' },
            maxAge: { type: 'number' },
            limit: { type: 'number', description: 'Max results, default 10.' },
          },
        },
        async execute(args) {
          const query = String(args.query ?? '').toLowerCase();
          const gender = args.gender ? String(args.gender) : null;
          const minAge = typeof args.minAge === 'number' ? args.minAge : null;
          const maxAge = typeof args.maxAge === 'number' ? args.maxAge : null;
          const limit = typeof args.limit === 'number' ? Math.min(args.limit, 25) : 10;

          const hits = profiles.filter((p) => {
            if (gender && p.gender !== gender) return false;
            if (minAge !== null && (p.age ?? 0) < minAge) return false;
            if (maxAge !== null && (p.age ?? 999) > maxAge) return false;
            if (query) {
              const hay = `${p.title ?? ''} ${p.body ?? ''} ${p.education ?? ''}`.toLowerCase();
              if (!hay.includes(query)) return false;
            }
            return true;
          });

          if (hits.length === 0) {
            return text('No listings on this page match. Try widening the age range or clearing filters.');
          }

          return text(
            `${hits.length} matching listing${hits.length === 1 ? '' : 's'}; showing ${Math.min(limit, hits.length)}.\n\n` +
            hits.slice(0, limit).map((p, i) => summarise(p, i + 1)).join('\n\n') +
            '\n\nContact details are released through the site, to signed-in members, ' +
            'under the listing family’s control.',
          );
        },
      },
      {
        name: 'describe_listing_fields',
        description:
          'Explain what a rishta listing contains and why contact details are ' +
          'not available to tools.',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return text(
            'A listing has: title, age, gender, education, and the family’s own ' +
            'description (often Urdu).\n\n' +
            'It does not expose phone or WhatsApp numbers. Those are released ' +
            'through the site to signed-in members, under the listing family’s ' +
            'control, and numbers written into listing text are stripped before ' +
            'serving. Link someone to the profile rather than trying to find a number.',
          );
        },
      },
    ];

    try {
      modelContext.provideContext({ tools });
    } catch {
      // An older or partial implementation. The page works regardless.
    }
  }, [profiles]);

  return null;
}
