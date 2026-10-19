const POSTMARK_URL = 'https://api.postmarkapp.com/email';

export interface EmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  /** Optional sender override; falls back to EMAIL_FROM so a missing env can never block delivery. */
  from?: string;
  /** Optional Reply-To address (Postmark `ReplyTo`), e.g. the person who wrote in. CR/LF are stripped. */
  replyTo?: string;
  attachments?: { name: string; contentBase64: string; contentType: string }[];
  /** Optional Postmark Tag, for grouping in the Postmark activity view. */
  tag?: string;
  /** Optional Postmark Metadata; Postmark echoes it back on delivery and bounce webhooks. */
  metadata?: Record<string, string>;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  /** Postmark's MessageID, when Postmark accepted the message and returned one. */
  messageId?: string;
}

/** Sender for candidate-facing onboarding emails. Undefined when unconfigured (callers fall back). */
export function onboardingFrom(): string | undefined {
  return process.env.ONBOARDING_EMAIL_FROM || undefined;
}

/**
 * Sends via Postmark. NEVER throws: email failure must not break a flow.
 * Free dev tier: may be limited to own-domain recipients until the account
 * is approved for production sending.
 */
/**
 * Postmark answers in well under a second. Without a bound, one hung
 * connection holds a sequential cron (weekly installs, reminders) until the
 * function's own limit kills the whole run.
 */
export const EMAIL_TIMEOUT_MS = 10_000;

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

export async function sendEmail(input: EmailInput): Promise<SendEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = input.from ?? process.env.EMAIL_FROM;
  if (!token || !from) {
    console.warn('[email] not configured; skipping send:', input.subject);
    return { ok: false, error: 'not_configured' };
  }
  // Header-injection guard: an address never contains a line break.
  const replyTo = input.replyTo?.replace(/[\r\n]/g, '').trim();
  try {
    const res = await fetch(POSTMARK_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: input.to,
        Subject: input.subject,
        HtmlBody: input.htmlBody,
        TextBody: input.textBody,
        MessageStream: 'outbound',
        ...(replyTo ? { ReplyTo: replyTo } : {}),
        ...(input.tag ? { Tag: input.tag } : {}),
        ...(input.metadata && Object.keys(input.metadata).length ? { Metadata: input.metadata } : {}),
        ...(input.attachments?.length
          ? {
              Attachments: input.attachments.map((attachment) => ({
                Name: attachment.name,
                Content: attachment.contentBase64,
                ContentType: attachment.contentType,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      console.error('[email] postmark send failed', res.status, await res.text());
      return { ok: false, error: `postmark_${res.status}` };
    }
    const messageId = await readMessageId(res);
    return messageId ? { ok: true, messageId } : { ok: true };
  } catch (err) {
    if (isTimeout(err)) {
      console.error('[email] postmark send timed out after', EMAIL_TIMEOUT_MS, 'ms');
      return { ok: false, error: 'timeout' };
    }
    console.error('[email] postmark send threw', err);
    return { ok: false, error: 'network' };
  }
}

/** Postmark's MessageID from a 2xx send response. A body that is missing or unreadable is not a failure. */
async function readMessageId(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const id = typeof body === 'object' && body !== null ? (body as { MessageID?: unknown }).MessageID : undefined;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}
