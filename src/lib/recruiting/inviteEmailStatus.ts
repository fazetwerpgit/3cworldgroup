import { FieldValue } from 'firebase-admin/firestore';
import type { InviteEmailStatus } from '@/types';
import { INVITE_EMAIL_TAG } from './inviteLink';

// What happened to an invite email, saved on the invite doc so the Recruits
// row can say it: 'sent' / 'failed' when the send returns, then 'delivered' or
// 'bounced' when Postmark's webhook reports back.

/**
 * Saves the send result on the invite. Never throws: the invite exists and the
 * email already went (or didn't), so a failed status write must not turn the
 * response into an error the manager would retry.
 *
 * Runs as a transaction so a delivery/bounce the webhook held because it
 * arrived before this write (see heldInviteEmailEventPatch) is applied here
 * instead of being lost.
 */
export async function saveInviteEmailStatus(
  ref: FirebaseFirestore.DocumentReference,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    await ref.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      transaction.update(ref, withHeldInviteEmailEvent(snapshot.data() ?? {}, fields));
    });
  } catch (error) {
    console.error('[invites] could not save the invite email status', error);
  }
}

interface HeldInviteEmailEvent {
  kind: InviteEmailEvent['kind'];
  messageId: string;
  at: unknown;
}

function heldEventOf(invite: FirebaseFirestore.DocumentData): HeldInviteEmailEvent | null {
  const held = invite.heldEmailEvent as Partial<HeldInviteEmailEvent> | null | undefined;
  if (!held || (held.kind !== 'delivered' && held.kind !== 'bounced')) return null;
  const messageId = text(held.messageId);
  return messageId ? { kind: held.kind, messageId, at: held.at ?? null } : null;
}

/**
 * The send-result patch, plus the held webhook event when it belongs to this
 * send. Any held event is cleared: one for another message is from an older
 * send and no longer matters.
 */
export function withHeldInviteEmailEvent(
  invite: FirebaseFirestore.DocumentData,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!('heldEmailEvent' in invite)) return fields;
  const patch: Record<string, unknown> = { ...fields, heldEmailEvent: FieldValue.delete() };
  const held = heldEventOf(invite);
  const sentId = text(fields.postmarkMessageId);
  if (!held || fields.emailStatus !== 'sent' || !sentId || held.messageId !== sentId) return patch;
  const at = held.at ?? FieldValue.serverTimestamp();
  return held.kind === 'delivered'
    ? { ...patch, emailStatus: 'delivered', deliveredAt: at }
    : { ...patch, emailStatus: 'bounced', bouncedAt: at };
}

export interface InviteEmailEvent {
  kind: 'delivered' | 'bounced';
  /** From Metadata.inviteId; null when the event carries no metadata. */
  inviteId: string | null;
  messageId: string | null;
  /** When Postmark says it happened; null when missing or unreadable. */
  at: Date | null;
}

// Bounce records that are not a failed delivery: a delay notice, an
// out-of-office reply, list (un)subscribe or address-change notices.
const NOT_A_FAILURE = new Set([
  'Transient',
  'AutoResponder',
  'AddressChange',
  'Subscribe',
  'Unsubscribe',
  'ChallengeVerification',
  'OpenRelayTest',
]);

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

function dateOf(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The invite delivery/bounce in a Postmark webhook body, or null for anything
 * else: other record types, other emails' tags, informational bounces.
 */
export function parseInviteEmailEvent(body: unknown): InviteEmailEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const tag = text(record.Tag);
  if (tag && tag !== INVITE_EMAIL_TAG) return null;
  const metadata = typeof record.Metadata === 'object' && record.Metadata !== null
    ? (record.Metadata as Record<string, unknown>)
    : {};
  const inviteId = text(metadata.inviteId);
  const messageId = text(record.MessageID);
  if (!inviteId && !messageId) return null;

  if (record.RecordType === 'Delivery') {
    return { kind: 'delivered', inviteId, messageId, at: dateOf(record.DeliveredAt) };
  }
  if (record.RecordType === 'Bounce') {
    if (NOT_A_FAILURE.has(String(record.Type ?? ''))) return null;
    return { kind: 'bounced', inviteId, messageId, at: dateOf(record.BouncedAt) };
  }
  return null;
}

const STALE_SLACK_MS = 5 * 60_000;

const RANK: Record<InviteEmailStatus, number> = { failed: 0, sent: 0, delivered: 1, bounced: 2 };

function millis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const date = (value as { toDate?: () => Date } | null)?.toDate?.();
  return date instanceof Date ? date.getTime() : null;
}

/**
 * The patch an event makes to the invite, or null to leave it alone. Events
 * only move the status forward (sent -> delivered -> bounced), so a repeat,
 * a late delivery after a bounce, or an event from an email sent before the
 * latest resend never changes what the row says.
 */
export function inviteEmailEventPatch(
  invite: FirebaseFirestore.DocumentData,
  event: InviteEmailEvent
): Record<string, unknown> | null {
  const current = invite.emailStatus as InviteEmailStatus | undefined;
  // No send on record (an older invite, or the last send failed): nothing to update.
  if (current !== 'sent' && current !== 'delivered' && current !== 'bounced') return null;
  const savedId = text(invite.postmarkMessageId);
  if (savedId && event.messageId && savedId !== event.messageId) return null;
  // Without a saved message id, an event from well before the latest send is
  // from an older one. (emailedAt is written after Postmark answers, so a real
  // delivery can land a moment before it: hence the slack.)
  const emailedMs = savedId ? null : millis(invite.emailedAt);
  if (emailedMs !== null && event.at && event.at.getTime() < emailedMs - STALE_SLACK_MS) return null;
  if (RANK[event.kind] <= RANK[current]) return null;

  const at = event.at ?? FieldValue.serverTimestamp();
  return event.kind === 'delivered'
    ? { emailStatus: 'delivered', deliveredAt: at }
    : { emailStatus: 'bounced', bouncedAt: at };
}

/**
 * When inviteEmailEventPatch has nothing to apply because the send that
 * produced this event is not saved on the invite yet (Postmark's webhook can
 * beat the write after sendInviteEmail returns), the patch that holds the
 * event on the invite so saveInviteEmailStatus applies it. Null when the event
 * matches the saved send (then it was a repeat or a step backwards) or carries
 * no message id to match later.
 */
export function heldInviteEmailEventPatch(
  invite: FirebaseFirestore.DocumentData,
  event: InviteEmailEvent
): Record<string, unknown> | null {
  if (!event.messageId) return null;
  const current = invite.emailStatus as InviteEmailStatus | undefined;
  const recorded = current === 'sent' || current === 'delivered' || current === 'bounced';
  const savedId = text(invite.postmarkMessageId);
  if (recorded && (!savedId || savedId === event.messageId)) return null;
  const held = heldEventOf(invite);
  if (held && held.messageId === event.messageId && RANK[held.kind] >= RANK[event.kind]) return null;
  return { heldEmailEvent: { kind: event.kind, messageId: event.messageId, at: event.at ?? null } };
}
