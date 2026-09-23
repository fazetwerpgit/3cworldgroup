import type { ChatAttachment, ChatReplySnippet } from '@/types';

// Client-side send reliability for team chat: idempotent message ids, the
// retry policy for a send that failed on bad signal, and the per-user outbox
// that keeps unsent messages across a reload or an app kill. Pure (no DOM at
// import) so the API route can share the id helpers and tests can drive it.

// A client-generated key the POST route turns into the message's doc id, so a
// retried send (or one whose response was lost) can never post twice.
const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export function isValidClientMessageId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_MESSAGE_ID_PATTERN.test(value);
}

export function newClientMessageId(): string {
  const cryptoApi = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Scoped by author so one user's key can never land on another user's message.
// The client derives the same id for its optimistic echo, which is how the echo
// reconciles with the delivered message (and keeps its React key).
export function chatMessageDocId(uid: string, clientMessageId: string): string {
  return `${uid}_${clientMessageId}`;
}

// ── Retry policy ────────────────────────────────────────────────────────────

// Backoff between automatic attempts while the device reports it is online
// (iOS often reports online on a dead cell connection): ~4 minutes in all.
export const RETRY_DELAYS_MS = [1_500, 4_000, 10_000, 25_000, 60_000, 120_000];
// A message stops retrying on its own once it is this old; after that it shows
// "Not sent · Tap to retry" so nothing stale goes out without the author's say.
export const AUTO_RETRY_MAX_AGE_MS = 30 * 60 * 1000;
// Restored outbox entries older than this are dropped outright.
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SendFailure = { kind: 'network' } | { kind: 'http'; status: number };

// A send/upload request that failed in a classifiable way. Anything else thrown
// on the send path (a photo the phone can't read, a HEIC it can't convert) is
// permanent and goes straight to "Not sent".
export class SendRequestError extends Error {
  constructor(
    message: string,
    readonly failure: SendFailure
  ) {
    super(message);
    this.name = 'SendRequestError';
  }
}

export function classifySendError(error: unknown): SendFailure | null {
  if (error instanceof SendRequestError) return error.failure;
  // fetch() rejects with a TypeError when the request never completes; an
  // aborted (timed-out) request and Firebase Auth's token refresh failing
  // offline are the same situation.
  if (error instanceof TypeError) return { kind: 'network' };
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return { kind: 'network' };
  if ((error as { code?: unknown } | null)?.code === 'auth/network-request-failed') return { kind: 'network' };
  return null;
}

// Retryable: the request never reached us, timed out, or the server/edge was
// briefly unhappy. Anything else (400 bad reply target, 403, 404…) will fail
// the same way again, so it goes straight to "Not sent".
export function isRetryableFailure(failure: SendFailure): boolean {
  if (failure.kind === 'network') return true;
  return failure.status === 408 || failure.status === 429 || failure.status >= 500;
}

export type RetryDecision =
  | { action: 'fail' }
  | { action: 'wait-online' }
  | { action: 'retry'; delayMs: number };

/**
 * What to do after a send attempt failed. `attempts` counts attempts made so
 * far (including the one that just failed). Offline failures don't burn an
 * attempt: they wait for the 'online' event instead of a timer.
 */
export function decideAfterFailure(input: {
  failure: SendFailure;
  attempts: number;
  ageMs: number;
  online: boolean;
}): RetryDecision {
  if (!isRetryableFailure(input.failure)) return { action: 'fail' };
  if (input.ageMs >= AUTO_RETRY_MAX_AGE_MS) return { action: 'fail' };
  if (!input.online) return { action: 'wait-online' };
  const delayMs = RETRY_DELAYS_MS[input.attempts - 1];
  return delayMs === undefined ? { action: 'fail' } : { action: 'retry', delayMs };
}

// ── Reconciliation ──────────────────────────────────────────────────────────

interface EchoLike {
  id: string;
  channelId: string;
  pendingState?: 'sending' | 'failed';
  // The doc id the POST reported (normally equal to id; differs only for a
  // legacy send the server stored under a random id).
  deliveredId?: string;
}

/**
 * Splits echoes into the ones still to render and the ones the realtime feed
 * has delivered. Matching is by doc id only, so two identical texts never
 * cross-match, and a "failed" echo whose POST actually landed (response lost)
 * still resolves the moment its message shows up.
 */
export function reconcileEchoes<E extends EchoLike>(
  deliveredIds: ReadonlySet<string>,
  echoes: E[],
  channelId: string
): { unreconciled: E[]; reconciledIds: string[] } {
  const unreconciled: E[] = [];
  const reconciledIds: string[] = [];
  for (const echo of echoes) {
    if (echo.channelId !== channelId) continue;
    if (deliveredIds.has(echo.id) || (echo.deliveredId && deliveredIds.has(echo.deliveredId))) {
      reconciledIds.push(echo.id);
    } else {
      unreconciled.push(echo);
    }
  }
  return { unreconciled, reconciledIds };
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface OutboxEntry {
  id: string;
  clientMessageId: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: number;
  attachment?: ChatAttachment;
  replyTo?: ChatReplySnippet;
  replyToMessageId?: string;
  failed: boolean;
}

export const OUTBOX_KEY_PREFIX = '3c.chat.outbox.v1.';

export function outboxKey(uid: string): string {
  return `${OUTBOX_KEY_PREFIX}${uid}`;
}

interface PersistableEcho {
  id: string;
  clientMessageId?: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: Date | null;
  attachment?: ChatAttachment;
  uploadedAttachment?: ChatAttachment;
  pendingFile?: File;
  replyTo?: ChatReplySnippet;
  replyToMessageId?: string;
  pendingState?: 'sending' | 'failed';
  deliveredId?: string;
}

/**
 * The echoes worth keeping across a reload: undelivered ones with a client id.
 * A photo still waiting on its upload is left out — the picked file can't be
 * stored in localStorage — while one already uploaded keeps its server URL.
 */
export function toOutboxEntries(echoes: PersistableEcho[]): OutboxEntry[] {
  const entries: OutboxEntry[] = [];
  for (const echo of echoes) {
    if (!echo.clientMessageId || echo.deliveredId || !echo.pendingState) continue;
    const attachment = echo.uploadedAttachment ?? (echo.attachment?.type === 'gif' ? echo.attachment : undefined);
    if (echo.pendingFile && !echo.uploadedAttachment) continue;
    entries.push({
      id: echo.id,
      clientMessageId: echo.clientMessageId,
      channelId: echo.channelId,
      text: echo.text,
      authorId: echo.authorId,
      authorName: echo.authorName,
      ...(echo.authorRole ? { authorRole: echo.authorRole } : {}),
      createdAt: (echo.createdAt ?? new Date()).getTime(),
      ...(attachment ? { attachment } : {}),
      ...(echo.replyTo ? { replyTo: echo.replyTo } : {}),
      ...(echo.replyToMessageId ? { replyToMessageId: echo.replyToMessageId } : {}),
      failed: echo.pendingState === 'failed',
    });
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseAttachment(value: unknown): ChatAttachment | undefined {
  if (!isRecord(value)) return undefined;
  if ((value.type !== 'image' && value.type !== 'gif') || typeof value.url !== 'string' || !value.url) return undefined;
  const attachment: ChatAttachment = { type: value.type, url: value.url };
  if (typeof value.width === 'number' && value.width > 0) attachment.width = value.width;
  if (typeof value.height === 'number' && value.height > 0) attachment.height = value.height;
  if (typeof value.contentType === 'string') attachment.contentType = value.contentType;
  return attachment;
}

function parseReplyTo(value: unknown): ChatReplySnippet | undefined {
  if (!isRecord(value) || typeof value.messageId !== 'string' || !value.messageId) return undefined;
  return {
    messageId: value.messageId,
    authorName: typeof value.authorName === 'string' ? value.authorName : '3C User',
    text: typeof value.text === 'string' ? value.text : '',
  };
}

/**
 * Reads a stored outbox back, defensively: malformed rows, rows for another
 * user, and rows older than OUTBOX_MAX_AGE_MS are dropped. Rows past the
 * auto-retry age come back as failed so they wait for a tap.
 */
export function parseOutbox(raw: string | null, uid: string, now: number): OutboxEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries: OutboxEntry[] = [];
  const seen = new Set<string>();
  for (const row of parsed) {
    if (!isRecord(row)) continue;
    const { id, clientMessageId, channelId, text, authorId, authorName, createdAt } = row;
    if (typeof id !== 'string' || seen.has(id)) continue;
    if (!isValidClientMessageId(clientMessageId) || id !== chatMessageDocId(uid, clientMessageId)) continue;
    if (typeof channelId !== 'string' || !channelId || authorId !== uid) continue;
    if (typeof text !== 'string' || typeof authorName !== 'string') continue;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) continue;
    if (now - createdAt > OUTBOX_MAX_AGE_MS) continue;
    const attachment = parseAttachment(row.attachment);
    if (!text && !attachment) continue;
    const replyTo = parseReplyTo(row.replyTo);
    seen.add(id);
    entries.push({
      id,
      clientMessageId,
      channelId,
      text,
      authorId,
      authorName,
      ...(typeof row.authorRole === 'string' ? { authorRole: row.authorRole } : {}),
      createdAt,
      ...(attachment ? { attachment } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(typeof row.replyToMessageId === 'string' && row.replyToMessageId
        ? { replyToMessageId: row.replyToMessageId }
        : {}),
      failed: row.failed === true || now - createdAt >= AUTO_RETRY_MAX_AGE_MS,
    });
  }
  return entries;
}
