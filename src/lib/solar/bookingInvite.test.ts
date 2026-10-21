import { describe, expect, it } from 'vitest';
import {
  bookingIcsUid,
  consultantBookingAttachment,
  consultantBookingCancelAttachment,
  consultantBookingCancelIcs,
  consultantBookingIcs,
  customerBookingAttachment,
  customerBookingCancelAttachment,
  customerBookingCancelIcs,
  customerBookingIcs,
} from './bookingInvite';

const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');
const prop = (ics: string, name: string) =>
  unfold(ics)
    .split('\r\n')
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1);

const BASE = {
  bookingId: 'own_2026-10-26T15:00:00.000Z',
  mode: 'virtual' as const,
  start: '2026-10-26T15:00:00.000Z',
  end: '2026-10-26T16:00:00.000Z',
  consultantName: 'Sam Closer',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  consultantPhone: '+15125550142',
  customerName: 'Ana Lopez',
  customerPhone: '512-555-0199',
  address: '12 Elm St, Austin, TX, 78701',
  leadUrl: 'https://portal.test/portal/admin/solar?tab=leads&lead=rep1_c1',
  stamp: new Date('2026-10-20T00:00:00.000Z'),
};

describe('customerBookingIcs', () => {
  it('virtual: Meet link as location and in the description, consultant phone', () => {
    const ics = customerBookingIcs(BASE);
    expect(prop(ics, 'UID')).toBe('own_2026-10-26T15:00:00.000Z@3cworldgroup.com');
    expect(prop(ics, 'SUMMARY')).toBe('Solar consultation with Sam Closer');
    expect(prop(ics, 'LOCATION')).toBe('https://meet.google.com/abc-defg-hij');
    expect(prop(ics, 'URL')).toBe('https://meet.google.com/abc-defg-hij');
    expect(prop(ics, 'DTSTART')).toBe('20261026T150000Z');
    expect(prop(ics, 'DTEND')).toBe('20261026T160000Z');
    const d = prop(ics, 'DESCRIPTION')!;
    expect(d).toContain('Join on Google Meet: https://meet.google.com/abc-defg-hij');
    expect(d).toContain('Call or text Sam at (512) 555-0142.');
    // The homeowner's own phone is not in their copy.
    expect(d).not.toContain('0199');
  });

  it('in person: the address is the location, and no Meet link anywhere', () => {
    const ics = customerBookingIcs({ ...BASE, mode: 'in_person' });
    expect(prop(ics, 'LOCATION')).toBe('12 Elm St\\, Austin\\, TX\\, 78701');
    expect(ics).not.toContain('meet.google.com');
  });

  it('with nothing set: no location, no link, no phone line, no "undefined"', () => {
    const ics = customerBookingIcs({ ...BASE, meetLink: '', consultantPhone: '', address: '' });
    expect(prop(ics, 'LOCATION')).toBeUndefined();
    expect(prop(ics, 'URL')).toBeUndefined();
    expect(ics).not.toMatch(/undefined|Call or text/);
  });
});

describe('consultantBookingIcs', () => {
  it('names the homeowner and carries their phone, address, the Meet link and the lead link', () => {
    const ics = consultantBookingIcs(BASE);
    expect(prop(ics, 'SUMMARY')).toBe('Solar consult: Ana Lopez');
    const d = prop(ics, 'DESCRIPTION')!;
    expect(d).toContain('Phone: (512) 555-0199');
    expect(d).toContain('Address: 12 Elm St\\, Austin\\, TX\\, 78701');
    expect(d).toContain('Google Meet: https://meet.google.com/abc-defg-hij');
    expect(d).toContain('Lead: https://portal.test/portal/admin/solar?tab=leads&lead=rep1_c1');
  });

  it('shares the UID with the homeowner copy', () => {
    expect(prop(consultantBookingIcs(BASE), 'UID')).toBe(prop(customerBookingIcs(BASE), 'UID'));
    expect(prop(consultantBookingIcs(BASE), 'UID')).toBe(bookingIcsUid(BASE.bookingId));
  });

  it('leaves out what the lead lacks', () => {
    const d = prop(consultantBookingIcs({ ...BASE, mode: 'in_person', customerPhone: '', customerName: '' }), 'DESCRIPTION')!;
    expect(d).not.toMatch(/Phone:|Google Meet|undefined/);
    expect(prop(consultantBookingIcs({ ...BASE, customerName: '' }), 'SUMMARY')).toBe('Solar consult: Homeowner');
  });
});

describe('attachments', () => {
  it('are named .ics files with the PUBLISH content type', () => {
    expect(customerBookingAttachment(BASE)).toMatchObject({
      name: 'solar-consultation.ics',
      contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
    });
    expect(consultantBookingAttachment(BASE).name).toBe('solar-consult.ics');
  });
});

describe('booking cancel .ics', () => {
  const CANCEL = {
    bookingId: BASE.bookingId,
    start: BASE.start,
    end: BASE.end,
    consultantName: BASE.consultantName,
    customerName: BASE.customerName,
    stamp: BASE.stamp,
  };

  it("homeowner's cancel: same UID as the invite, METHOD:CANCEL, SEQUENCE above the invite's", () => {
    const invite = customerBookingIcs(BASE);
    const cancel = customerBookingCancelIcs(CANCEL);
    expect(prop(cancel, 'UID')).toBe(prop(invite, 'UID'));
    expect(prop(cancel, 'METHOD')).toBe('CANCEL');
    expect(prop(cancel, 'STATUS')).toBe('CANCELLED');
    expect(prop(invite, 'SEQUENCE')).toBe('0');
    expect(prop(cancel, 'SEQUENCE')).toBe('1');
    expect(prop(cancel, 'DTSTART')).toBe(prop(invite, 'DTSTART'));
    expect(prop(cancel, 'SUMMARY')).toBe('Solar consultation with Sam Closer');
  });

  it("consultant's cancel matches the consultant invite's UID", () => {
    const cancel = consultantBookingCancelIcs(CANCEL);
    expect(prop(cancel, 'UID')).toBe(prop(consultantBookingIcs(BASE), 'UID'));
    expect(prop(cancel, 'METHOD')).toBe('CANCEL');
    expect(prop(cancel, 'SEQUENCE')).toBe('1');
  });

  it('attachments are labelled method=CANCEL', () => {
    expect(customerBookingCancelAttachment(CANCEL).contentType).toContain('method=CANCEL');
    expect(consultantBookingCancelAttachment(CANCEL).contentType).toContain('method=CANCEL');
  });
});
