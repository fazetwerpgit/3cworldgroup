import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { notifySubmission } from '@/lib/forms/notifySubmission';
import { appendApplicationRow } from '@/lib/sheets/applicationsSheet';

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
