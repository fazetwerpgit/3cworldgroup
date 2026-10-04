import { decryptField, encryptField } from '@/lib/security/fieldEncryption';
import { onboardingFrom, sendEmail } from '@/lib/email/sendEmail';
import { inviteEmail } from '@/lib/email/templates';

// An invite is found by the hash of its token, so the hash alone cannot rebuild
// the link. The token is also kept encrypted (tokenEncrypted) so a manager can
// copy or re-send the same link later. Invites made before that field existed
// have no saved link: re-sending one issues a fresh token instead.

export function inviteUrlFor(origin: string, token: string): string {
  return `${origin}/onboard/${token}`;
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

/** Emails the hire their link from the onboarding department. True when Postmark accepted it. */
export async function sendInviteEmail(to: string, inviteUrl: string): Promise<boolean> {
  // Must be awaited: on serverless the instance freezes once the response
  // returns, killing any in-flight send. sendEmail never throws.
  const result = await sendEmail({ to, from: onboardingFrom(), ...inviteEmail({ inviteUrl }) });
  return result.ok;
}
