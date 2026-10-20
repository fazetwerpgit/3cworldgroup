// The one lead alert per solar lead. It goes out when the appointment is set
// (POST bookings) or, when nothing is booked, when the rep finishes with the
// homeowner (POST leads/{id}/finish). `alertSentAt` on the lead makes it once.
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, solarLeadAlertEmail } from '@/lib/email/templates';
import { bookingZones, formatWhen, timeIn, zoneAbbr } from '@/lib/solar/timezones';
import { CREDIT_TIER_LABELS, PHOTO_SLOTS, PHOTO_SLOT_LABELS, ROOF_TYPE_LABELS, isCreditTier, isRoofType } from '@/lib/solar/leadFields';
import { leadAlertUids, loadContacts } from '@/lib/solar/server';
import { solarLeadHref } from '@/lib/solar/leadView';

/** V4 signed URLs max out at 7 days; a minute of slack keeps the signer happy. */
const PHOTO_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000 - 60_000;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A 7-day read link for each stored photo folder ({folder}file.{ext}). Missing files are skipped. */
async function signPhotos(photos: unknown): Promise<{ label: string; url: string }[]> {
  if (!photos || typeof photos !== 'object') return [];
  const stored = photos as Record<string, unknown>;
  const slots = PHOTO_SLOTS.filter((slot) => text(stored[slot]));
  if (slots.length === 0) return [];
  const bucket = getOnboardingBucket();
  const expires = Date.now() + PHOTO_LINK_TTL_MS;
  const signed = await Promise.all(
    slots.map(async (slot) => {
      try {
        const folder = text(stored[slot]);
        const prefix = folder.endsWith('/') ? folder : `${folder}/`;
        const [files] = await bucket.getFiles({ prefix, delimiter: '/' });
        if (files.length === 0) return null;
        const [url] = await files[0].getSignedUrl({ version: 'v4', action: 'read', expires });
        return { label: PHOTO_SLOT_LABELS[slot], url };
      } catch (error) {
        console.error(`solar lead photo sign failed (${slot}):`, error);
        return null;
      }
    })
  );
  return signed.filter((p): p is { label: string; url: string } => p !== null);
}

/** The lead's booking, for the alert, or null when there is none. */
async function bookingFor(bookingId: string) {
  if (!adminDb || !bookingId) return null;
  const snap = await adminDb.collection('solarBookings').doc(bookingId).get();
  if (!snap.exists || snap.get('status') === 'cancelled') return null;
  const start = text(snap.get('start'));
  if (!start) return null;
  // The customer's zone, plus the consultant's when it differs.
  const { consultantTz, customerTz } = bookingZones(snap.data());
  const consultantPart =
    zoneAbbr(consultantTz, start) === zoneAbbr(customerTz, start)
      ? ''
      : ` (${timeIn(start, consultantTz)} ${zoneAbbr(consultantTz, start)} for the consultant)`;
  return {
    when: `${formatWhen(start, customerTz)}${consultantPart}`,
    mode: snap.get('mode') === 'virtual' ? 'virtual' : 'in-person',
    consultantName: text(snap.get('consultantName')) || 'a consultant',
  };
}

/**
 * Sends the lead alert (notification, push, email) unless it already went out.
 * Returns whether this call sent it. Best-effort past the stamp: a failed
 * message never fails the caller's request.
 */
export async function sendLeadAlertOnce(leadId: string): Promise<boolean> {
  if (!adminDb) return false;
  const ref = adminDb.collection('solarLeads').doc(leadId);
  // Claim the alert atomically, so a booking and a finish racing send one.
  const lead = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('alertSentAt')) return null;
    tx.update(ref, { alertSentAt: new Date() });
    return snap;
  });
  if (!lead) return false;

  try {
    const uids = await leadAlertUids();
    if (uids.length === 0) return true;
    const customerName = `${text(lead.get('first'))} ${text(lead.get('last'))}`.trim();
    const repName = text(lead.get('repName'));
    const city = text(lead.get('city'));
    const booking = await bookingFor(text(lead.get('bookingId')));
    const link = solarLeadHref(leadId);
    const title = booking ? 'Solar appointment set' : 'New solar lead';
    const message = `${repName || 'A rep'} added ${customerName}${city ? ` in ${city}` : ''}${
      booking ? `: ${booking.mode}, ${booking.when}.` : '. No appointment booked.'
    }`;

    await createNotificationForMany(uids, {
      type: 'solar_lead',
      title,
      message,
      link,
      metadata: { leadId },
    }).catch((error) => console.error('solar lead notification failed:', error));
    await Promise.allSettled(uids.map((uid) => sendPushToUser(uid, { title, body: message, url: link })));

    const monthlyBill = lead.get('monthlyBill');
    const creditTier = lead.get('creditTier');
    const roofType = lead.get('roofType');
    const monthlyKwh = lead.get('monthlyKwh');
    const [contacts, photos] = await Promise.all([loadContacts(uids), signPhotos(lead.get('photos'))]);
    const email = solarLeadAlertEmail({
      repName,
      customerName,
      address: [lead.get('address'), city, lead.get('state'), lead.get('zip')].map(text).filter(Boolean).join(', '),
      phone: text(lead.get('phone')),
      email: text(lead.get('email')),
      monthlyBill: typeof monthlyBill === 'number' ? `$${monthlyBill.toFixed(2)}` : '',
      creditTier: isCreditTier(creditTier) ? CREDIT_TIER_LABELS[creditTier] : 'Not picked',
      roofType: isRoofType(roofType) ? ROOF_TYPE_LABELS[roofType] : '',
      monthlyKwh:
        typeof monthlyKwh === 'number' && Number.isFinite(monthlyKwh)
          ? `${Math.round(monthlyKwh).toLocaleString('en-US')} kWh/mo`
          : '',
      needsReview:
        lead.get('needsReview') === true
          ? lead.get('heavyShade') === true
            ? 'Yes: heavy shade on the roof'
            : 'Yes'
          : '',
      booking,
      photos,
      link: `${appBaseUrl()}${link}`,
    });
    for (const c of contacts) {
      if (!c.email) continue;
      await sendEmail({ to: c.email, ...email, tag: 'solar-lead' });
    }
  } catch (error) {
    console.error('solar lead alert failed:', error);
  }
  return true;
}
