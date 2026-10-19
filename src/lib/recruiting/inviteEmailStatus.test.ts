import { describe, expect, it } from 'vitest';
import { heldInviteEmailEventPatch, saveInviteEmailStatus, withHeldInviteEmailEvent } from './inviteEmailStatus';

const isMethod = (value: unknown, name: string) => (value as { methodName?: string } | null)?.methodName === name;

// One invite doc behind a DocumentReference whose transactions read and write it.
function fakeRef(initial: Record<string, unknown>) {
  const doc = { data: { ...initial } };
  const write = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...doc.data, ...patch };
    for (const [key, value] of Object.entries(patch)) if (isMethod(value, 'FieldValue.delete')) delete next[key];
    doc.data = next;
  };
  const ref = {
    firestore: {
      runTransaction: async <T,>(run: (transaction: unknown) => Promise<T>) =>
        run({
          get: async () => ({ exists: true, data: () => doc.data }),
          update: (_ref: unknown, patch: Record<string, unknown>) => write(patch),
        }),
    },
  } as unknown as FirebaseFirestore.DocumentReference;
  return { ref, doc };
}

const sentFields = (messageId: string) => ({ emailStatus: 'sent', postmarkMessageId: messageId });
const deliveredAt = new Date('2026-10-15T14:00:05Z');

describe('saveInviteEmailStatus', () => {
  it('applies a delivery the webhook held for this send', async () => {
    const { ref, doc } = fakeRef({ heldEmailEvent: { kind: 'delivered', messageId: 'pm-1', at: deliveredAt } });
    await saveInviteEmailStatus(ref, sentFields('pm-1'));
    expect(doc.data).toEqual({ emailStatus: 'delivered', postmarkMessageId: 'pm-1', deliveredAt });
  });

  it('applies a held bounce, stamping the server time when Postmark gave none', async () => {
    const { ref, doc } = fakeRef({ heldEmailEvent: { kind: 'bounced', messageId: 'pm-1', at: null } });
    await saveInviteEmailStatus(ref, sentFields('pm-1'));
    expect(doc.data.emailStatus).toBe('bounced');
    expect(isMethod(doc.data.bouncedAt, 'FieldValue.serverTimestamp')).toBe(true);
  });

  it('drops a held event from another message, and on a failed send', async () => {
    const other = fakeRef({ heldEmailEvent: { kind: 'bounced', messageId: 'pm-old', at: deliveredAt } });
    await saveInviteEmailStatus(other.ref, sentFields('pm-1'));
    expect(other.doc.data).toEqual({ emailStatus: 'sent', postmarkMessageId: 'pm-1' });

    const failed = fakeRef({ heldEmailEvent: { kind: 'delivered', messageId: 'pm-1', at: deliveredAt } });
    await saveInviteEmailStatus(failed.ref, { emailStatus: 'failed', emailError: 'postmark_422' });
    expect(failed.doc.data).toEqual({ emailStatus: 'failed', emailError: 'postmark_422' });
  });

  it('writes the fields unchanged when nothing is held', () => {
    expect(withHeldInviteEmailEvent({ status: 'invited' }, sentFields('pm-1'))).toEqual(sentFields('pm-1'));
  });

  it('never throws when the write fails', async () => {
    const ref = {
      firestore: { runTransaction: async () => Promise.reject(new Error('down')) },
    } as unknown as FirebaseFirestore.DocumentReference;
    const quiet = console.error;
    console.error = () => {};
    await expect(saveInviteEmailStatus(ref, sentFields('pm-1'))).resolves.toBeUndefined();
    console.error = quiet;
  });
});

describe('heldInviteEmailEventPatch', () => {
  const event = { kind: 'delivered' as const, inviteId: 'inv-1', messageId: 'pm-1', at: deliveredAt };

  it('holds events while the send is not saved, or the saved send is an older message', () => {
    expect(heldInviteEmailEventPatch({}, event)).toEqual({
      heldEmailEvent: { kind: 'delivered', messageId: 'pm-1', at: deliveredAt },
    });
    expect(heldInviteEmailEventPatch({ emailStatus: 'sent', postmarkMessageId: 'pm-0' }, event)).not.toBeNull();
  });

  it('does not hold events for the saved send, without a message id, or already held', () => {
    expect(heldInviteEmailEventPatch({ emailStatus: 'sent', postmarkMessageId: 'pm-1' }, event)).toBeNull();
    expect(heldInviteEmailEventPatch({ emailStatus: 'sent' }, event)).toBeNull();
    expect(heldInviteEmailEventPatch({}, { ...event, messageId: null })).toBeNull();
    expect(
      heldInviteEmailEventPatch({ heldEmailEvent: { kind: 'bounced', messageId: 'pm-1', at: null } }, event)
    ).toBeNull();
  });
});
