/**
 * Building — and validating — RCS agent messages.
 *
 * Every limit enforced here is one the API enforces too, and would otherwise
 * enforce one number at a time, mid-send, after some of a campaign had already
 * gone out. Checking the payload once before the loop turns "37 of 200 sent,
 * then 163 identical 400s" into a form error.
 *
 * Sources, all from the send guide and the AgentMessage reference:
 *   text            ≤ 3,072 characters
 *   suggestions     ≤ 11 per message, ≤ 4 per rich card
 *   postbackData    ≤ 2,048 characters
 *   carousel        2–10 cards
 *   total payload   ≤ 250 KB
 */

/** Media panel heights, as the API names them (112 / 168 / 264 DP). */
export type MediaHeight = 'SHORT' | 'MEDIUM' | 'TALL';
export type CardWidth   = 'SMALL' | 'MEDIUM' | 'LARGE';

/**
 * Why this message is being sent.
 *
 * Not cosmetic: it is what carriers bill and filter on, and mislabelling a
 * promotion as a transaction is the fastest way to lose an agent's launch
 * approval. AUTHENTICATION is OTP traffic, which this agent does not send —
 * OTP goes through Firebase Phone Auth (lib/firebase-verify.ts).
 */
export type TrafficType =
  | 'TRANSACTION'      // triggered by something the member did
  | 'PROMOTION'        // marketing; needs consent
  | 'SERVICEREQUEST'   // consented service updates
  | 'ACKNOWLEDGEMENT'  // unsubscribe confirmations
  | 'AUTHENTICATION';  // OTP-only agents

export interface Suggestion {
  /** Button label. */
  text: string;
  /** Sent back to the webhook when tapped — how a reply is identified. */
  postbackData: string;
  /** A reply posts back; a URL turns the button into a link out. */
  url?: string;
  /** Dial action, E.164. */
  dial?: string;
}

export interface CardSpec {
  title?:       string;
  description?: string;
  imageUrl?:    string;
  height?:      MediaHeight;
  suggestions?: Suggestion[];
}

export type RcsPayload =
  | { kind: 'text';     text: string;         suggestions?: Suggestion[] }
  | { kind: 'card';     card: CardSpec }
  | { kind: 'carousel'; cards: CardSpec[];    width?: CardWidth };

const MAX_TEXT          = 3072;
const MAX_SUGGESTIONS   = 11;
const MAX_CARD_SUGG     = 4;
const MAX_POSTBACK      = 2048;
const MAX_PAYLOAD_BYTES = 250 * 1024;
const CAROUSEL_MIN      = 2;
const CAROUSEL_MAX      = 10;

/** One `suggestions[]` entry, in whichever of the three shapes was asked for. */
function toSuggestion(s: Suggestion): Record<string, unknown> {
  if (s.url) {
    return { action: { text: s.text, postbackData: s.postbackData, openUrlAction: { url: s.url } } };
  }
  if (s.dial) {
    return { action: { text: s.text, postbackData: s.postbackData, dialAction: { phoneNumber: s.dial } } };
  }
  return { reply: { text: s.text, postbackData: s.postbackData } };
}

function toCardContent(c: CardSpec): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  if (c.title)       content.title       = c.title;
  if (c.description) content.description = c.description;
  if (c.imageUrl) {
    content.media = {
      height: c.height ?? 'MEDIUM',
      // forceRefresh false lets Google keep its cached copy of the image. True
      // is for when a URL's contents changed but the URL did not — rare, and it
      // costs a refetch per recipient, so it is not the default.
      contentInfo: { fileUrl: c.imageUrl, forceRefresh: false },
    };
  }
  if (c.suggestions?.length) content.suggestions = c.suggestions.map(toSuggestion);
  return content;
}

/**
 * Everything wrong with a payload, not just the first thing.
 *
 * An admin fixing a campaign one error per submit is an admin who gives up on
 * the fourth round trip.
 */
export function validatePayload(p: RcsPayload): string[] {
  const errors: string[] = [];

  const checkSuggestions = (list: Suggestion[] | undefined, max: number, where: string) => {
    if (!list?.length) return;
    if (list.length > max) errors.push(`${where}: ${list.length} suggestions, the limit is ${max}`);
    list.forEach((s, i) => {
      if (!s.text?.trim())         errors.push(`${where}: suggestion ${i + 1} has no label`);
      if (!s.postbackData?.trim()) errors.push(`${where}: suggestion ${i + 1} has no postback data`);
      if ((s.postbackData ?? '').length > MAX_POSTBACK) {
        errors.push(`${where}: suggestion ${i + 1} postback data is over ${MAX_POSTBACK} characters`);
      }
    });
  };

  if (p.kind === 'text') {
    if (!p.text?.trim())        errors.push('Message text is empty');
    if (p.text?.length > MAX_TEXT) errors.push(`Message text is ${p.text.length} characters, the limit is ${MAX_TEXT}`);
    checkSuggestions(p.suggestions, MAX_SUGGESTIONS, 'Message');
  }

  if (p.kind === 'card') {
    const c = p.card;
    if (!c.title?.trim() && !c.description?.trim() && !c.imageUrl?.trim()) {
      errors.push('A card needs at least a title, a description or an image');
    }
    checkSuggestions(c.suggestions, MAX_CARD_SUGG, 'Card');
  }

  if (p.kind === 'carousel') {
    if (p.cards.length < CAROUSEL_MIN) errors.push(`A carousel needs at least ${CAROUSEL_MIN} cards`);
    if (p.cards.length > CAROUSEL_MAX) errors.push(`A carousel takes at most ${CAROUSEL_MAX} cards`);
    p.cards.forEach((c, i) => {
      if (!c.title?.trim() && !c.description?.trim() && !c.imageUrl?.trim()) {
        errors.push(`Card ${i + 1} is empty`);
      }
      checkSuggestions(c.suggestions, MAX_CARD_SUGG, `Card ${i + 1}`);
    });
  }

  // Size last: it can only be judged on the finished body, and it is the one
  // limit an author cannot estimate by eye.
  if (errors.length === 0) {
    const bytes = Buffer.byteLength(JSON.stringify(buildAgentMessage(p, 'TRANSACTION')), 'utf8');
    if (bytes > MAX_PAYLOAD_BYTES) {
      errors.push(`Message is ${Math.round(bytes / 1024)} KB, the limit is ${MAX_PAYLOAD_BYTES / 1024} KB`);
    }
  }

  return errors;
}

/** The request body for POST .../agentMessages. */
export function buildAgentMessage(p: RcsPayload, traffic: TrafficType): Record<string, unknown> {
  let contentMessage: Record<string, unknown>;

  if (p.kind === 'text') {
    contentMessage = { text: p.text };
    if (p.suggestions?.length) contentMessage.suggestions = p.suggestions.map(toSuggestion);
  } else if (p.kind === 'card') {
    contentMessage = {
      richCard: {
        standaloneCard: {
          cardOrientation: 'VERTICAL',
          cardContent: toCardContent(p.card),
        },
      },
    };
  } else {
    contentMessage = {
      richCard: {
        carouselCard: {
          cardWidth: p.width ?? 'MEDIUM',
          cardContents: p.cards.map(toCardContent),
        },
      },
    };
  }

  return { contentMessage, messageTrafficType: traffic };
}

/**
 * A one-line description of what a payload is, for the send log.
 *
 * Stored per message so the log stays readable after a campaign's draft has
 * been edited or deleted — a log that has to re-derive its own subject from
 * today's draft is not a log.
 */
export function summarise(p: RcsPayload): string {
  if (p.kind === 'text')     return p.text.slice(0, 120);
  if (p.kind === 'card')     return p.card.title || p.card.description?.slice(0, 120) || 'Rich card';
  return `Carousel · ${p.cards.length} cards`;
}
