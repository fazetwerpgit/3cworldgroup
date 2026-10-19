import { NextRequest, NextResponse } from 'next/server';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { readClientId } from '@/lib/forms/idempotency';
import { userRateLimited } from '@/lib/userRateLimits';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, solarLeadAlertEmail } from '@/lib/email/templates';
import { leadAlertUids, loadContacts, requireSolarUser } from '@/lib/solar/server';
import { parseLead, type LeadFields } from '@/lib/solar/leadFields';

// Lead alerts are best-effort: a failed notification, push or email never
// fails the lead the rep just captured.
async function alertNewLead(id: string, fields: LeadFields, repName: string) {
  try {
    const uids = await leadAlertUids();
    if (uids.length === 0) return;
    const customerName = `${fields.first} ${fields.last}`.trim();
    const title = 'New solar lead';
    const message = `${repName} added ${customerName}${fields.city ? ` in ${fields.city}` : ''}.`;
    const link = '/portal/admin';
    await createNotificationForMany(uids, { type: 'solar_lead', title, message, link, metadata: { leadId: id } }).catch(
      (error) => console.error('solar lead notification failed:', error)
    );
    await Promise.allSettled(uids.map((uid) => sendPushToUser(uid, { title, body: message, url: link })));
    const contacts = await loadContacts(uids);
    const email = solarLeadAlertEmail({
      repName,
      customerName,
      address: [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(', '),
      phone: fields.phone,
      email: fields.email,
      monthlyBill: fields.monthlyBill === null ? '' : `$${fields.monthlyBill.toFixed(2)}`,
      link: `${appBaseUrl()}${link}`,
    });
    for (const c of contacts) {
      if (!c.email) continue;
      await sendEmail({ to: c.email, ...email, tag: 'solar-lead' });
    }
  } catch (error) {
    console.error('solar lead alert failed:', error);
  }
}

// POST /api/portal/solar/leads - a rep (portal deck or 3C Doors) submits a solar lead.
// Body: {clientId?, first, last, address, city, state, zip, phone, email,
//   monthlyBill, creditTier?, photos?{billPage1,billGraph,panel}, doorId?, campaignId?}
// -> 200 {success, id}. Idempotent on clientId / Idempotency-Key: a resend
// answers the first lead's id and alerts nobody twice.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const limited = userRateLimited('formSubmit', gate.uid);
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const idem = readClientId(body, request.headers);
    if (!idem.ok) return NextResponse.json({ error: idem.error }, { status: 400 });
    const parsed = parseLead(body as Record<string, unknown>, gate.uid);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { id, duplicate } = await submitFormRecord(
      'solarLeads',
      { uid: gate.uid, name: gate.name, email: gate.email },
      parsed.fields,
      { clientId: idem.clientId }
    );
    if (!duplicate) await alertNewLead(id, parsed.fields, gate.name);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting solar lead:', error);
    return NextResponse.json({ error: 'Failed to submit solar lead' }, { status: 500 });
  }
}
