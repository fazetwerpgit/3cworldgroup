import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { activateUser, getActivationReadiness } from '@/lib/onboarding/activation';
import { getRecruitingRequester } from '@/lib/recruiting/requester';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const requestedBy = gate.uid;

    const body = await request.json();
    const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
    const action = body.action === 'rejected' ? 'rejected' : 'approved';

    if (!inviteId) {
      return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
    }

    const requester = await getRecruitingRequester(requestedBy);
    if (!requester?.canManage) {
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

    // Only act on invites that are still awaiting a decision. Acting on an
    // already converted/rejected invite would, e.g., flip an active user back
    // to inactive on a duplicate reject.
    if (invite.status === 'converted' || invite.status === 'rejected') {
      return NextResponse.json(
        { error: `This recruit was already ${invite.status}` },
        { status: 400 }
      );
    }

    const now = new Date();
    if (action === 'rejected') {
      const userRef = adminDb.collection('users').doc(invite.convertedUserId);
      // Read invite + user inside the transaction so a concurrent Activate (or
      // the hire's own last approval) can't be overwritten by this reject.
      const outcome = await adminDb.runTransaction(async (tx) => {
        const [freshInvite, user] = await Promise.all([tx.get(inviteRef), tx.get(userRef)]);
        const freshStatus = freshInvite.get('status');
        if (freshStatus === 'converted' || freshStatus === 'rejected') return `already_${freshStatus}`;
        if (user.get('status') === 'active') return 'active';
        tx.set(
          inviteRef,
          {
            status: 'rejected',
            reviewedBy: requestedBy,
            reviewerName: requester.name,
            reviewedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        tx.set(userRef, { status: 'inactive', updatedAt: now }, { merge: true });
        return 'rejected';
      });
      if (outcome === 'active') {
        return NextResponse.json(
          { error: 'This recruit has already finished onboarding and is an active rep. Deactivate them from People instead.' },
          { status: 409 }
        );
      }
      if (outcome !== 'rejected') {
        return NextResponse.json(
          { error: `This recruit was already ${outcome.replace('already_', '')}` },
          { status: 400 }
        );
      }

      // A rejected hire leaves every chat channel (Firestore reads + pushes).
      try {
        await reconcileChatMembershipForUser(invite.convertedUserId);
      } catch (error) {
        console.error('[recruiting] chat membership reconcile failed', error);
      }
      // Their stalled/activation tasks are no longer anyone's to act on.
      try {
        await resolveAlertTasks(invite.convertedUserId);
      } catch (error) {
        console.error('[recruiting] alert task resolve failed', error);
      }

      return NextResponse.json({ success: true, status: 'rejected' });
    }

    const targetUserRef = adminDb.collection('users').doc(invite.convertedUserId);
    const targetUser = await targetUserRef.get();
    if (targetUser.get('status') !== 'active') {
      const readiness = await getActivationReadiness(invite.convertedUserId);
      if (!readiness.ready) {
        return NextResponse.json(
          { error: 'not ready', missing: readiness.missing },
          { status: 409 }
        );
      }
    }

    const activation = await activateUser(invite.convertedUserId);
    if (!activation) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
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
