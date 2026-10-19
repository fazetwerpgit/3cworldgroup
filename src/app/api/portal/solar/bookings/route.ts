import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { userRateLimited } from '@/lib/userRateLimits';
import { isAlreadyExists } from '@/lib/forms/idempotency';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, managerAlertEmail, solarBookingConfirmationEmail } from '@/lib/email/templates';
import { bookingDocId, formatSlotPT, isSolarMode, openSlots, type SolarMode } from '@/lib/solar/availability';
import { consultantNotice, loadAvailability, loadBookings, requireSolarUser } from '@/lib/solar/server';
import { sendLeadAlertOnce } from '@/lib/solar/leadAlert';

const SLOT_TAKEN = { error: 'slot_taken' };

type Booking = {
  id: string;
  mode: SolarMode;
  start: string;
  consultantUid: string;
  consultantName: string;
  customerName: string;
  customerEmail: string;
  repName: string;
};

// Customer confirmation + consultant notice. Best-effort: the booking stands
// even when a message fails. consultantNotice() keeps the owner out of it
// while owner notifications are off (Jacob gets the notice instead).
async function announceBooking(b: Booking) {
  const when = formatSlotPT(b.start);
  const how = b.mode === 'virtual' ? 'virtual' : 'in-person';
  try {
    const notice = await consultantNotice(b.consultantUid);
    if (b.customerEmail) {
      await sendEmail({
        to: b.customerEmail,
        ...solarBookingConfirmationEmail({
          customerName: b.customerName,
          when,
          mode: b.mode,
          consultantName: b.consultantName,
        }),
        ...(notice.replyTo ? { replyTo: notice.replyTo } : {}),
        tag: 'solar-booking',
      });
    }
    const to = notice.to;
    if (!to) return;
    const title = `${notice.titlePrefix}Solar consult booked`;
    const message = `${b.customerName || 'A customer'}: ${how}, ${when} PT with ${b.consultantName} (booked by ${b.repName}).`;
    const link = '/portal/admin';
    await createNotification({
      userId: to.uid,
      type: 'solar_booking',
      title,
      message,
      link,
      metadata: { bookingId: b.id },
    }).catch((error) => console.error('solar booking notification failed:', error));
    await sendPushToUser(to.uid, { title, body: message, url: link }).catch(() => {});
    if (to.email) {
      await sendEmail({ to: to.email, ...managerAlertEmail({ title, message, link: `${appBaseUrl()}${link}` }), tag: 'solar-booking' });
    }
  } catch (error) {
    console.error('solar booking announce failed:', error);
  }
}

// POST /api/portal/solar/bookings {leadId, mode, consultantUid, start}
// -> 200 {success, id} | 409 {error: 'slot_taken'} | 400 {error: 'slot_unavailable'}.
// The slot must start at least 2 hours out. A booking sends the lead alert
// (once per lead, see lib/solar/leadAlert.ts).
// The doc id is `${consultantUid}_${startISO}` written with create(), so two
// reps racing for one slot get exactly one booking.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const limited = userRateLimited('formSubmit', gate.uid);
    if (limited) return limited;
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    const consultantUid = typeof body?.consultantUid === 'string' ? body.consultantUid.trim() : '';
    const mode = body?.mode;
    const startDate = typeof body?.start === 'string' ? new Date(body.start) : null;
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(leadId) || !/^[A-Za-z0-9_-]{1,128}$/.test(consultantUid)) {
      return NextResponse.json({ error: 'leadId and consultantUid are required' }, { status: 400 });
    }
    if (!isSolarMode(mode)) return NextResponse.json({ error: 'mode must be virtual or in_person' }, { status: 400 });
    if (!startDate || Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start' }, { status: 400 });
    }
    const start = startDate.toISOString();

    const leadRef = adminDb.collection('solarLeads').doc(leadId);
    const lead = await leadRef.get();
    if (!lead.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.get('repUid') !== gate.uid && !gate.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // The slot must be one the consultant offers in this mode, and still open.
    const now = new Date();
    const windowEnd = new Date(startDate.getTime() + 60_000);
    const availability = (await loadAvailability()).filter((a) => a.consultantUid === consultantUid);
    const offered = openSlots(availability, [], mode, startDate, windowEnd, now).find((s) => s.start === start);
    if (!offered) return NextResponse.json({ error: 'slot_unavailable' }, { status: 400 });
    const bookings = await loadBookings(startDate, new Date(startDate.getTime() + 86_400_000));
    const open = openSlots(availability, bookings, mode, startDate, windowEnd, now).some((s) => s.start === start);
    if (!open) return NextResponse.json(SLOT_TAKEN, { status: 409 });

    const id = bookingDocId(consultantUid, start);
    const customerName = `${lead.get('first') ?? ''} ${lead.get('last') ?? ''}`.trim();
    const customerEmail = typeof lead.get('email') === 'string' ? (lead.get('email') as string) : '';
    try {
      await adminDb.collection('solarBookings').doc(id).create({
        leadId,
        mode,
        consultantUid,
        consultantName: offered.name,
        start,
        end: offered.end,
        startAt: startDate,
        endAt: new Date(offered.end),
        repUid: gate.uid,
        repName: gate.name,
        customerName,
        customerEmail,
        status: 'booked',
        createdAt: now,
      });
    } catch (error) {
      if (isAlreadyExists(error)) return NextResponse.json(SLOT_TAKEN, { status: 409 });
      throw error;
    }
    await leadRef
      .update({ status: 'booked', bookingId: id, updatedAt: now })
      .catch((error: unknown) => console.error('solar lead booking stamp failed:', error));

    await announceBooking({
      id,
      mode,
      start,
      consultantUid,
      consultantName: offered.name,
      customerName,
      customerEmail,
      repName: gate.name,
    });
    await sendLeadAlertOnce(leadId).catch((error) => console.error('solar lead alert failed:', error));
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error booking solar consult:', error);
    return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
  }
}
