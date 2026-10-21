import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/createNotification', () => ({ createNotification: vi.fn(async () => 'n1') }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/solar/google/bookingEvents', () => ({ removeBookingFromGoogle: vi.fn(async () => true) }));
vi.mock('@/lib/solar/server', () => ({
  consultantNotice: vi.fn(),
  ownerNotificationsEnabled: vi.fn(async () => false),
  resolveConsultants: vi.fn(async () => ({ owner: { uid: 'own' }, jacob: { uid: 'jac', email: 'jmyers@3cworldgroup.com' } })),
}));

import { announceBookingCancel, type CancelledBooking } from './bookingCancel';
import { sendEmail } from '@/lib/email/sendEmail';
import { removeBookingFromGoogle } from '@/lib/solar/google/bookingEvents';
import { consultantNotice } from '@/lib/solar/server';

const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const mockRemove = removeBookingFromGoogle as unknown as ReturnType<typeof vi.fn>;
const mockNotice = consultantNotice as unknown as ReturnType<typeof vi.fn>;

const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');
const icsOf = (call: { attachments: { contentBase64: string }[] }) =>
  unfold(Buffer.from(call.attachments[0].contentBase64, 'base64').toString('utf8')).split('\r\n');
const sentTo = () => mockEmail.mock.calls.map((c) => c[0].to);

const CANCELLED: CancelledBooking = {
  id: 'con_2026-10-26T15:00:00.000Z',
  leadId: 'rep1_c1',
  consultantUid: 'con',
  consultantName: 'Sam Closer',
  repUid: 'rep1',
  customerName: 'Ana Lopez',
  customerEmail: 'ana@example.com',
  start: '2026-10-26T15:00:00.000Z',
  end: '2026-10-26T16:00:00.000Z',
  mode: 'in_person',
  consultantTz: 'America/Chicago',
  customerTz: 'America/Los_Angeles',
  googleEventId: '',
};

const SAM = { to: { uid: 'con', email: 'sam@3cworldgroup.com' }, titlePrefix: '', replyTo: 'sam@3cworldgroup.com' };

beforeEach(() => {
  mockEmail.mockReset().mockResolvedValue({ ok: true });
  mockRemove.mockClear();
  mockNotice.mockReset().mockResolvedValue(SAM);
});

describe('announceBookingCancel emails', () => {
  it('without Google: the homeowner gets a short cancel with a METHOD:CANCEL .ics (same UID, SEQUENCE 1)', async () => {
    await announceBookingCancel(CANCELLED, 'rep1');
    expect(mockRemove).not.toHaveBeenCalled();
    const toHomeowner = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toHomeowner.subject).toBe('Your solar consultation is cancelled');
    expect(toHomeowner.textBody).toBe(
      'Hi Ana Lopez,\n\n' +
        'Your in-person consultation with Sam Closer on Monday, October 26 at 8:00 AM PT is cancelled.\n\n' +
        'The attached update removes it from your calendar.\n\n' +
        'If you would like a new time, reply to this email.\n\n' +
        '3C World Group\n'
    );
    // No portal links or internal details.
    expect(toHomeowner.textBody).not.toMatch(/portal|lead|lost|http/i);
    expect(toHomeowner.htmlBody).not.toMatch(/<a\s|http|lead|lost/i);
    expect(toHomeowner.replyTo).toBe('sam@3cworldgroup.com');
    expect(toHomeowner.attachments[0].contentType).toBe('text/calendar; charset=utf-8; method=CANCEL');
    const ics = icsOf(toHomeowner);
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain(`UID:${CANCELLED.id}@3cworldgroup.com`);
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it("without Google: the consultant's .ics is cancelled too, even when they cancelled it", async () => {
    await announceBookingCancel(CANCELLED, 'con');
    expect(sentTo().sort()).toEqual(['ana@example.com', 'sam@3cworldgroup.com']);
    const toSam = mockEmail.mock.calls.find((c) => c[0].to === 'sam@3cworldgroup.com')![0];
    expect(toSam.subject).toBe('[Portal] Solar consult cancelled');
    const ics = icsOf(toSam);
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('SUMMARY:Solar consult: Ana Lopez');
  });

  it('with Google: no emails at all (Google sends its own cancellation), and the event is deleted', async () => {
    await announceBookingCancel({ ...CANCELLED, googleEventId: 'evt1' }, 'rep1');
    expect(mockRemove).toHaveBeenCalledWith('con', 'evt1');
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it('with an unconfirmed Google event (our .ics went out instead): the event is deleted and the homeowner still gets the CANCEL .ics', async () => {
    await announceBookingCancel({ ...CANCELLED, googleEventId: 'evt1', googleEventUnconfirmed: true }, 'rep1');
    expect(mockRemove).toHaveBeenCalledWith('con', 'evt1');
    const toHomeowner = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(icsOf(toHomeowner)).toContain('METHOD:CANCEL');
  });

  it("with Google on the owner's calendar: Jacob's notice copy (his own .ics) is still cancelled; the homeowner is not emailed", async () => {
    mockNotice.mockResolvedValue({
      to: { uid: 'jac', email: 'jmyers@3cworldgroup.com' },
      titlePrefix: "[Owner's calendar] ",
      replyTo: 'jmyers@3cworldgroup.com',
    });
    await announceBookingCancel({ ...CANCELLED, consultantUid: 'own', googleEventId: 'evt1' }, 'rep1');
    expect(sentTo()).toEqual(['jmyers@3cworldgroup.com']);
  });

  it('no homeowner email on file: only the consultant copy goes out', async () => {
    await announceBookingCancel({ ...CANCELLED, customerEmail: '' }, 'rep1');
    expect(sentTo()).toEqual(['sam@3cworldgroup.com']);
  });

  it('a consultant without an email: only the homeowner copy', async () => {
    mockNotice.mockResolvedValue({ to: { uid: 'con', email: '' }, titlePrefix: '', replyTo: '' });
    await announceBookingCancel(CANCELLED, 'rep1');
    expect(sentTo()).toEqual(['ana@example.com']);
    expect(mockEmail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it('a booking with no end still gets a cancel (an hour long), and a failed send never throws', async () => {
    mockEmail.mockRejectedValue(new Error('postmark down'));
    await expect(announceBookingCancel({ ...CANCELLED, end: '' }, 'rep1')).resolves.toBeUndefined();
    const ics = icsOf(mockEmail.mock.calls[0][0]);
    expect(ics).toContain('DTEND:20261026T160000Z');
  });
});
