import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { getOwnerRecipients } from '@/lib/onboarding/ownerNotify';

/*
  The public Contact form. Same shape as /api/public/applications: honeypot
  first, then validate, then store, then tell the people who need to know.

  Delivery is a document in `contactMessages` plus an email to every owner
  (the same recipient list onboarding uses). No portal push alert: the
  FORM_ALERTS deep-link would point at an admin inbox that does not exist yet,
  and a notification that opens nothing is worse than none. Add the alert when
  that page exists.

  The email is best-effort. The message is already stored by the time it is
  sent, so a mail failure is logged and the sender still sees success.
*/

const SUBJECTS: Record<string, string> = {
  services: 'Service inquiry',
  careers: 'Career opportunity',
  support: 'Customer support',
  partnership: 'Partnership inquiry',
  other: 'Other',
};

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (clean(body.website)) {
      return NextResponse.json({ success: true });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const name = clean(body.name);
    const email = clean(body.email, 180).toLowerCase();
    const phone = clean(body.phone, 60);
    const subjectKey = clean(body.subject, 40);
    const subject = subjectKey in SUBJECTS ? subjectKey : 'other';
    const message = clean(body.message, 4000);

    if (!name || !email.includes('@') || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    const now = new Date();
    const docRef = await adminDb.collection('contactMessages').add({
      name,
      email,
      phone,
      subject,
      message,
      status: 'new',
      source: 'website',
      createdAt: now,
      updatedAt: now,
    });

    const subjectLabel = SUBJECTS[subject];
    const lines = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || '—'}`,
      `Subject: ${subjectLabel}`,
      '',
      message,
    ];
    const textBody = lines.join('\n');
    const htmlBody = `<p>${lines.slice(0, 4).map(escapeHtml).join('<br>')}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;

    try {
      const recipients = await getOwnerRecipients();
      if (recipients.length === 0) {
        console.warn('[contact] no owner recipients configured; message stored only:', docRef.id);
      }
      const results = await Promise.all(
        recipients.map((to) =>
          sendEmail({ to, subject: `Website message: ${subjectLabel} from ${name}`, htmlBody, textBody })
        )
      );
      results.forEach((result, index) => {
        if (!result.ok) console.error('[contact] email failed for', recipients[index], result.error);
      });
    } catch (error) {
      console.error('[contact] email step failed; message stored:', docRef.id, error);
    }

    return NextResponse.json({ success: true, messageId: docRef.id });
  } catch (error) {
    console.error('Error storing contact message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
