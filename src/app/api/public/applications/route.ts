import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { notifySubmission } from '@/lib/forms/notifySubmission';
import { appendApplicationRow } from '@/lib/sheets/applicationsSheet';

/*
  Trim, cap, and drop control characters.

  The cap is what stops a caller pasting a novel into a Firestore document and
  a spreadsheet cell; `referredBy` carries the lowest trust of the five, since
  it arrives from `?ref=` in the URL rather than from anything the applicant
  typed, and it is capped at 180 below with the rest.

  The control-character strip is the other half. A raw tab or carriage return
  at the front of a value is one of the leads Google Sheets skips before it
  decides whether a cell is a formula, and embedded newlines break the row
  apart in every export downstream of it. `sanitizeSheetCell` in
  `src/lib/sheets/applicationsSheet.ts` is the guard on the Sheets side and
  does not depend on this one — a row must be safe whichever way it is built —
  but a value with no control characters in it never reaches that question.
*/
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function clean(value: unknown, max = 200) {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARS, ' ').trim().slice(0, max)
    : '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const honeypot = clean(body.website);
    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const name = clean(body.name);
    const phone = clean(body.phone, 60);
    const email = clean(body.email, 180).toLowerCase();
    const city = clean(body.city, 120);
    const referredBy = clean(body.referredBy, 180);

    if (!name || !phone || !email || !city) {
      return NextResponse.json(
        { error: 'Name, phone, email, and city are required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const docRef = await adminDb.collection('applications').add({
      name,
      phone,
      email,
      city,
      referredBy,
      status: 'applied',
      source: 'website',
      createdAt: now,
      updatedAt: now,
    });
    await appendApplicationRow({
      name,
      phone,
      email,
      city,
      referredBy,
      status: 'applied',
      createdAt: now,
    });
    await notifySubmission('application', `${name} (${city})`);

    return NextResponse.json({ success: true, applicationId: docRef.id });
  } catch (error) {
    console.error('Error creating application:', error);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }
}
