/**
 * Which provider sends.
 *
 * MESSAGING_PROVIDER=ojiva selects the real aggregator. Anything else — unset
 * included — is the sandbox. Defaulting to the sandbox is the safe direction:
 * forgetting the variable means nothing is sent, not that something is sent
 * through a provider nobody meant to use.
 */
import 'server-only';

import type { MessagingProvider } from '../types';
import { ojiva } from './ojiva';
import { sandbox } from './sandbox';

const PROVIDERS: Record<string, MessagingProvider> = { ojiva, sandbox };

export function activeProvider(): MessagingProvider {
  const id = process.env.MESSAGING_PROVIDER?.trim().toLowerCase();
  return id === 'ojiva' ? ojiva : sandbox;
}

export function providerById(id: string): MessagingProvider | null {
  return PROVIDERS[id] ?? null;
}
