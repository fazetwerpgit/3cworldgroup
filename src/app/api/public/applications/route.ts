import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { notifySubmission } from '@/lib/forms/notifySubmission';
import { appendApplicationRow } from '@/lib/sheets/applicationsSheet';
import { findActivePortalAccount } from '@/lib/auth/existingAccount';
import { applicationLimiter } from '@/lib/forms/publicLimiters';
import { clientIp } from '@/lib/rateLimit';
import {
  INVALID_EMAIL_MESSAGE,
  INVALID_PHONE_MESSAGE,
  PUBLIC_FIELD_LIMITS,
  clipText,
  isValidEmail,
  isValidUsPhone,
  readJsonObject,
} from '@/lib/forms/publicFields';

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

function clean(value: unknown, max: number = PUBLIC_FIELD_LIMITS.name) {
  return typeof value === 'string'
    ? clipText(value.replace(CONTROL_CHARS, ' ').trim(), max)
    : '';
}

export async function POST(request: NextRequest) {
  if (!applicationLimiter.take(clientIp(request))) {
    return NextResponse.json(
      { error: 'Too many applications from this connection. Please try again in a few minutes.' },
      { status: 429 }
    );
  }
  try {
    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: 'The application could not be read. Please try again.' }, { status: 400 });
    }
    const honeypot = clean(body.website);
    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const name = clean(body.name);
    const phone = clean(body.phone, PUBLIC_FIELD_LIMITS.phone);
    // Not clipped: a cut address is a different address. Over-long fails isValidEmail.
    const email = clean(body.email, Infinity).toLowerCase();
    const city = clean(body.city, PUBLIC_FIELD_LIMITS.city);
    const referredBy = clean(body.referredBy, PUBLIC_FIELD_LIMITS.referredBy);

    if (!name || !phone || !email || !city) {
      return NextResponse.json(
        { error: 'Name, phone, email, and city are required' },
        { status: 400 }
      );
    }
    if (!isValidUsPhone(phone)) {
      return NextResponse.json({ error: INVALID_PHONE_MESSAGE }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: INVALID_EMAIL_MESSAGE }, { status: 400 });
    }

    if (await findActivePortalAccount(email)) {
      return NextResponse.json(
        { error: 'You already have a 3C portal account. Sign in instead of re-applying.', code: 'account_exists' },
        { status: 409 }
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
