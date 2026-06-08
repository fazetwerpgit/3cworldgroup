import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { resolveRoles } from '@/types';

async function getRequester(userId: string) {
  if (!adminDb) return null;
  const doc = await adminDb.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
  const canConvert =
    role === 'admin' ||
    role === 'operations' ||
    fieldRole === 'l1_manager' ||
    fieldRole === 'l2_manager';
  return {
    uid: userId,
    role,
    fieldRole,
    canConvert,
    canViewAll: role === 'admin' || role === 'operations',
    name: data?.displayName || data?.email || '3C Manager',
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const requestedBy = typeof body.requestedBy === 'string' ? body.requestedBy : '';
    const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
    const action = body.action === 'rejected' ? 'rejected' : 'approved';

    if (!requestedBy || !inviteId) {
      return NextResponse.json(
        { error: 'requestedBy and inviteId are required' },
        { status: 400 }
      );
    }

    const requester = await getRequester(requestedBy);
    if (!requester?.canConvert) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const inviteRef = adminDb.collection('onboardingInvites').doc(inviteId);
    const inviteDoc = await inviteRef.get();
    if (!inviteDoc.exists) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const invite = inviteDoc.data();
    if (!requester.canViewAll && invite?.ownerId !== requestedBy) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!invite?.convertedUserId) {
      return NextResponse.json(
        { error: 'Recruit has not submitted onboarding yet' },
        { status: 400 }
      );
    }

    const now = new Date();
    if (action === 'rejected') {
      await Promise.all([
        inviteRef.set(
          {
            status: 'rejected',
            reviewedBy: requestedBy,
            reviewerName: requester.name,
            reviewedAt: now,
            updatedAt: now,
          },
          { merge: true }
        ),
        adminDb.collection('users').doc(invite.convertedUserId).set(
          {
            status: 'inactive',
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      return NextResponse.json({ success: true, status: 'rejected' });
    }

    await Promise.all([
      inviteRef.set(
        {
          status: 'converted',
          reviewedBy: requestedBy,
          reviewerName: requester.name,
          reviewedAt: now,
          updatedAt: now,
        },
        { merge: true }
      ),
      adminDb.collection('candidateOnboarding').doc(inviteId).set(
        {
          status: 'approved',
          reviewedBy: requestedBy,
          reviewerName: requester.name,
          reviewedAt: now,
          updatedAt: now,
        },
        { merge: true }
      ),
      adminDb.collection('users').doc(invite.convertedUserId).set(
        {
          status: 'active',
          hireDate: now,
          updatedAt: now,
        },
        { merge: true }
      ),
    ]);

    if (invite.applicationId) {
      await adminDb.collection('applications').doc(invite.applicationId).set(
        {
          status: 'converted',
          convertedUserId: invite.convertedUserId,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, status: 'converted' });
  } catch (error) {
    console.error('Error converting recruit:', error);
    return NextResponse.json({ error: 'Failed to convert recruit' }, { status: 500 });
  }
}
