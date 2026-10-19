import { FieldValue } from 'firebase-admin/firestore';
import { decryptField, encryptField } from '@/lib/security/fieldEncryption';
import { onboardingFrom, sendEmail } from '@/lib/email/sendEmail';
import { inviteEmail } from '@/lib/email/templates';
import { SITE_URL } from '@/app/_cinematic/nav';

// An invite is found by the hash of its token, so the hash alone cannot rebuild
// the link. The token is also kept encrypted (tokenEncrypted) so a manager can
// copy or re-send the same link later. Invites made before that field existed
// have no saved link: re-sending one issues a fresh token instead.

// Always the production origin, never the request host: dev and preview hosts
// share the production Firebase project, so an invite made there still goes to
// a real hire and must carry a link that works for them.
export function inviteUrlFor(token: string): string {
  return `${SITE_URL}/onboard/${token}`;
}

/**
 * The encrypted token for the invite doc, or null when encryption is not
 * configured. A missing key must not block hiring: the invite is still created
 * and emailed, it just cannot be copied later.
 */
export function sealInviteToken(token: string): string | null {
  try {
    return encryptField(token);
  } catch (error) {
    console.error('[invites] could not encrypt the invite token; the link will not be saved', error);
    return null;
  }
}

export function openInviteToken(sealed: unknown): string | null {
  if (typeof sealed !== 'string' || !sealed) return null;
  try {
    return decryptField(sealed);
  } catch (error) {
    console.error('[invites] could not decrypt a saved invite token', error);
    return null;
  }
}

/** Postmark Tag on every invite email; the events webhook matches on it with Metadata.inviteId. */
export const INVITE_EMAIL_TAG = 'onboarding-invite';

export interface InviteEmailResult {
  sent: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Emails the hire their link from the onboarding department. `sent` is true
 * when Postmark accepted it. The invite id rides along as Postmark Metadata so
 * the delivery/bounce webhook can find the invite again.
 */
export async function sendInviteEmail(to: string, inviteUrl: string, inviteId: string): Promise<InviteEmailResult> {
  // Must be awaited: on serverless the instance freezes once the response
  // returns, killing any in-flight send. sendEmail never throws.
  const result = await sendEmail({
    to,
    from: onboardingFrom(),
    tag: INVITE_EMAIL_TAG,
    metadata: { inviteId },
    ...inviteEmail({ inviteUrl }),
  });
  return {
    sent: result.ok,
    ...(result.messageId ? { messageId: result.messageId } : {}),
    ...(result.ok ? {} : { error: (result.error || 'unknown').slice(0, 40) }),
  };
}

/**
 * The invite-doc patch recording one send. Every email field is rewritten, so
 * a resend replaces what the last send (and its webhooks) left behind.
 */
export function inviteEmailFields(result: InviteEmailResult): Record<string, unknown> {
  const clear = FieldValue.delete();
  return result.sent
    ? {
        emailStatus: 'sent',
        emailedAt: FieldValue.serverTimestamp(),
        postmarkMessageId: result.messageId ?? clear,
        emailError: clear,
        deliveredAt: clear,
        bouncedAt: clear,
      }
    : {
        emailStatus: 'failed',
        emailError: result.error ?? 'unknown',
        emailedAt: clear,
        postmarkMessageId: clear,
        deliveredAt: clear,
        bouncedAt: clear,
      };
}
