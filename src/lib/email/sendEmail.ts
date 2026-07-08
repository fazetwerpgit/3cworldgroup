const POSTMARK_URL = 'https://api.postmarkapp.com/email';

export interface EmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Sends via Postmark. NEVER throws: email failure must not break a flow.
 * Free dev tier: may be limited to own-domain recipients until the account
 * is approved for production sending.
 */
export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EMAIL_FROM;
  if (!token || !from) {
    console.warn('[email] not configured; skipping send:', input.subject);
    return { ok: false, error: 'not_configured' };
  }
  try {
    const res = await fetch(POSTMARK_URL, {
      method: 'POST',
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
      }),
    });
    if (!res.ok) {
      console.error('[email] postmark send failed', res.status, await res.text());
      return { ok: false, error: `postmark_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] postmark send threw', err);
    return { ok: false, error: 'network' };
  }
}
