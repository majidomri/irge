/**
 * Minimal Telegram Bot API client.
 *
 * Telegram is the admin console for payment confirmation: an order that a member
 * claims arrives as a message with ✅ / ❌ buttons, and tapping one settles it
 * without anyone opening /nizam. That makes editMessageText and
 * answerCallbackQuery load-bearing, not decorative — the tapped message must
 * visibly change, or the admin has no idea whether the tap registered.
 *
 * Every function fails soft. A dead bot token must never take down a checkout:
 * the credits are already granted by the time we get here, and the sweep in
 * 008 §7 is what actually guarantees an unconfirmed grant gets reviewed.
 */

const API = 'https://api.telegram.org/bot';

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** The group/channel order notifications go to. */
export function target(): string | null {
  return process.env.TELEGRAM_TARGET?.trim() || null;
}

/** Optional forum topic id within the target group. */
export function threadId(): string | undefined {
  return process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim() || undefined;
}

/** HTML-escape — parse_mode is HTML on every message we send. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function call<T = unknown>(method: string, payload: unknown): Promise<T | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`${API}${t}/${method}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null) as { ok?: boolean; result?: T } | null;
    if (!json?.ok) {
      console.error(`[telegram] ${method} failed`, json);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`[telegram] ${method} threw`, e);
    return null;
  }
}

export interface InlineButton { text: string; callback_data: string }

export interface SentMessage { message_id: number; chat: { id: number } }

export async function sendMessage(
  text: string,
  buttons?: InlineButton[][],
  chatId?: string,
): Promise<SentMessage | null> {
  const chat = chatId ?? target();
  if (!chat) return null;
  const payload: Record<string, unknown> = {
    chat_id: chat,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  const thread = threadId();
  if (thread)  payload.message_thread_id = thread;
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  return call<SentMessage>('sendMessage', payload);
}

/**
 * Rewrite an already-sent message, dropping its buttons.
 *
 * Used the instant an order is settled so the same ✅ cannot be tapped twice by
 * two admins looking at the same message. (The RPCs are idempotent anyway — this
 * is about the humans, not the data.)
 */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
}

/**
 * Acknowledge a button tap. Telegram shows a spinner on the button until this
 * is called, so skipping it makes a working action look hung.
 */
export async function answerCallbackQuery(
  id: string,
  text?: string,
  alert = false,
): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });
}
