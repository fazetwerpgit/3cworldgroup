import { installDayKey } from '@/lib/sales/saleDate';

// Sales called out in chat but never logged. Reps post "1 gig" or "2gig 🔥" in
// All Company the moment they close; some never log the sale in the portal, and
// it only surfaces days later when the carrier report lists the order as not in
// the portal (Miles, Fri 10/9: four callouts, none logged). This is the quiet
// same-day nudge: callouts that Chicago day against the sales the rep logged
// FOR that day (by sale date). Pure; the reads live in lib/alerts/calloutNudges.

/** The channel callouts are read from (types/chat.ts CHAT_CHANNELS). */
export const CALLOUT_CHANNEL_ID = 'all-company';

/** A callout is a short message: "1 gig", "2 gig 🔥". A story that mentions a 2gig is not one. */
export const CALLOUT_MAX_WORDS = 5;

export const LOG_SALE_LINK = '/portal/sales/new';
export const BULK_LOG_LINK = '/portal/sales/new/bulk';

// Emoji (with skin tones, joiners and presentation selectors) are not words.
// Extended_Pictographic, not Emoji: digits are Emoji code points.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu;

// A plan speed: a number glued to (or one space from) a speed unit. "1gig",
// "1 gig", "2 gigs", "300 mb", "500mbps", "1gb". The number must start a word,
// so "x300mb" or a phone number does not read as one.
const SPEED = /(?:^|[^\p{L}\p{N}])\d{1,4}(?:\.\d)?\s*(?:gigs?|gb|mbps|mb|megs?)(?![\p{L}])/iu;

/**
 * True when a chat message reads as a sale callout: at most CALLOUT_MAX_WORDS
 * words once emoji are trimmed, naming a plan speed. A question ("1 gig?") is
 * somebody asking, not calling one out.
 */
export function isSaleCallout(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const plain = text.replace(EMOJI, ' ').trim();
  if (!plain || plain.includes('?')) return false;
  const words = plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (!words.length || words.length > CALLOUT_MAX_WORDS) return false;
  return SPEED.test(plain);
}

/** A chat message as the counting needs it. */
export interface CalloutMessage {
  authorId: string;
  authorName: string;
  text: string;
  createdAt: unknown;
  deletedAt?: unknown;
}

/** A logged sale as the counting needs it. Any sale that exists counts, whatever its status. */
export interface LoggedSale {
  salesRepId: string;
  saleDate?: unknown;
  createdAt?: unknown;
}

export interface CalloutDay {
  repId: string;
  repName: string;
  /** YYYY-MM-DD in Chicago. */
  day: string;
  callouts: number;
  logged: number;
  /** callouts − logged, never below 0. */
  gap: number;
}

/** GET /api/portal/sales/callouts: the caller's own count for today. */
export type CalloutStatus = Pick<CalloutDay, 'day' | 'callouts' | 'logged' | 'gap'>;

/** The Chicago day a sale is FOR: its sale date, else (older docs) when it was created. */
export function saleDayKey(sale: LoggedSale): string | null {
  return installDayKey(sale.saleDate) ?? installDayKey(sale.createdAt);
}

/**
 * One entry per rep per Chicago day with at least one callout, in day then
 * name order. Deleted messages and non-callouts are skipped here, so callers
 * can pass a raw day of chat.
 */
export function calloutDays(messages: readonly CalloutMessage[], sales: readonly LoggedSale[]): CalloutDay[] {
  const byKey = new Map<string, CalloutDay>();
  for (const message of messages) {
    if (message.deletedAt || !message.authorId || !isSaleCallout(message.text)) continue;
    const day = installDayKey(message.createdAt);
    if (!day) continue;
    const key = `${message.authorId}|${day}`;
    const entry = byKey.get(key);
    if (entry) entry.callouts += 1;
    else byKey.set(key, { repId: message.authorId, repName: message.authorName ?? '', day, callouts: 1, logged: 0, gap: 0 });
  }
  for (const sale of sales) {
    const day = saleDayKey(sale);
    const entry = day ? byKey.get(`${sale.salesRepId}|${day}`) : undefined;
    if (entry) entry.logged += 1;
  }
  return [...byKey.values()]
    .map((entry) => ({ ...entry, gap: Math.max(0, entry.callouts - entry.logged) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.repName.localeCompare(b.repName));
}

// ---------------------------------------------------------------- words

const sales = (count: number) => `${count} ${count === 1 ? 'sale' : 'sales'}`;

/** Where "Log sale" goes: the bulk logger when more than one is missing. */
export function calloutLogLink(gap: number): string {
  return gap > 1 ? BULK_LOG_LINK : LOG_SALE_LINK;
}

/** Rep Home: "You called out 2 sales today · 1 logged". */
export function calloutHomeLine(callouts: number, logged: number): string {
  return `You called out ${sales(callouts)} today · ${logged} logged`;
}

export const CALLOUT_HOME_WHY = 'Logged sales count on the board, show in your pay estimate and get install reminders.';

export const CALLOUT_PUSH_TITLE = "Log today's sales?";

/** "You called out 3 sales today and logged 1. Logging puts them on the board, …" */
export function calloutPushMessage(callouts: number, logged: number): string {
  const them = callouts === 1 ? 'it' : 'them';
  return (
    `You called out ${sales(callouts)} today and logged ${logged === 0 ? 'none' : logged}. ` +
    `Logging puts ${them} on the board, in your pay estimate and on install reminders.`
  );
}

/** "Miles R." for the owner's list: first name and last initial. */
export function shortRepName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first ?? '';
}
