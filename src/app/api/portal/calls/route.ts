import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  CALL_DAY_ORDER,
  CallAudience,
  CallDay,
  IBO_FIELD_ROLES,
  resolveRoles,
} from '@/types';

const VALID_DAYS: readonly string[] = CALL_DAY_ORDER;
const VALID_AUDIENCES: CallAudience[] = ['all', 'managers'];
// Meet links only - video is never hosted in the app
const MEET_LINK_PATTERN = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i;

function canManage(role?: string): boolean {
  return role === 'admin' || role === 'operations';
}

// GET /api/portal/calls?userId=xxx - The recurring call schedule, scoped
// by audience: entry reps see 'all' calls; managers and platform users
// also see 'managers' calls. Sorted by day order then time.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { role, fieldRole } = resolveRoles(
      userDoc.data()?.role,
      userDoc.data()?.fieldRole
    );
    const seesManagerCalls =
      !!role ||
      fieldRole === 'l1_manager' ||
      fieldRole === 'l2_manager' ||
      (fieldRole ? IBO_FIELD_ROLES.includes(fieldRole) : false);

    const snapshot = await adminDb.collection('scheduledCalls').get();
    const calls = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          title: d.title,
          description: d.description ?? '',
          day: d.day as CallDay,
          time: d.time,
          timezone: d.timezone ?? '',
          meetLink: d.meetLink,
          audience: (d.audience ?? 'all') as CallAudience,
          active: d.active ?? true,
          createdByName: d.createdByName ?? '',
        };
      })
      .filter((c) => c.active)
      .filter((c) => c.audience === 'all' || seesManagerCalls)
      .sort(
        (a, b) =>
          CALL_DAY_ORDER.indexOf(a.day) - CALL_DAY_ORDER.indexOf(b.day) ||
          a.time.localeCompare(b.time)
      );

    return NextResponse.json({ calls, canManage: canManage(role) });
  } catch (error) {
    console.error('Error fetching call schedule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch call schedule' },
      { status: 500 }
    );
  }
}

// POST /api/portal/calls - Ops/admin add a recurring call. Link must be a
// Google Meet URL; the app schedules and links out, it doesn't host video.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { title, description, day, time, timezone, meetLink, audience, createdBy, createdByName } = body;

    if (!title || !day || !time || !meetLink || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: title, day, time, meetLink, createdBy' },
        { status: 400 }
      );
    }

    const creatorDoc = await adminDb.collection('users').doc(createdBy).get();
    const creator = creatorDoc.exists
      ? resolveRoles(creatorDoc.data()?.role, creatorDoc.data()?.fieldRole)
      : null;
    if (!canManage(creator?.role)) {
      return NextResponse.json(
        { error: 'Only operations or admin can manage the call schedule' },
        { status: 403 }
      );
    }

    if (!VALID_DAYS.includes(day)) {
      return NextResponse.json({ error: 'Invalid day' }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return NextResponse.json(
        { error: 'Invalid time. Use 24h HH:mm' },
        { status: 400 }
      );
    }
    if (!MEET_LINK_PATTERN.test(String(meetLink).trim())) {
      return NextResponse.json(
        { error: 'Link must be a Google Meet URL (https://meet.google.com/...)' },
        { status: 400 }
      );
    }
    if (audience && !VALID_AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
    }

    const now = new Date();
    const docRef = await adminDb.collection('scheduledCalls').add({
      title: String(title).trim().slice(0, 200),
      description: typeof description === 'string' ? description.trim().slice(0, 1000) : '',
      day,
      time,
      timezone: typeof timezone === 'string' ? timezone.trim().slice(0, 100) : '',
      meetLink: String(meetLink).trim(),
      audience: audience ?? 'all',
      active: true,
      createdBy,
      createdByName: createdByName || '',
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Error creating call:', error);
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/calls - Remove a call from the schedule (hard delete;
// recurring calls have no history worth preserving).
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { callId, requestedBy } = body;
    if (!callId || !requestedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, requestedBy' },
        { status: 400 }
      );
    }

    const requesterDoc = await adminDb.collection('users').doc(requestedBy).get();
    const requester = requesterDoc.exists
      ? resolveRoles(requesterDoc.data()?.role, requesterDoc.data()?.fieldRole)
      : null;
    if (!canManage(requester?.role)) {
      return NextResponse.json(
        { error: 'Only operations or admin can manage the call schedule' },
        { status: 403 }
      );
    }

    const callDoc = await adminDb.collection('scheduledCalls').doc(callId).get();
    if (!callDoc.exists) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    await callDoc.ref.delete();
    return NextResponse.json({ success: true, message: 'Call removed' });
  } catch (error) {
    console.error('Error deleting call:', error);
    return NextResponse.json(
      { error: 'Failed to delete call' },
      { status: 500 }
    );
  }
}
