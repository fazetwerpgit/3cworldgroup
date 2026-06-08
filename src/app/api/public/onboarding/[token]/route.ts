import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { hashInviteToken } from '@/lib/recruiting/tokens';
import { getOnboardingItemsForUser } from '@/types';

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function getInviteByToken(token: string) {
  if (!adminDb) return null;
  const tokenHash = hashInviteToken(token);
  const snapshot = await adminDb
    .collection('onboardingInvites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() };
}

function isExpired(expiresAt: FirebaseFirestore.Timestamp | undefined) {
  return !!expiresAt?.toDate && expiresAt.toDate().getTime() < Date.now();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { token } = await params;
    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const data = invite.data;
    if (isExpired(data.expiresAt) || data.status === 'expired') {
      await invite.ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }

    if (['submitted', 'approved', 'converted'].includes(data.status)) {
      return NextResponse.json({
        invite: {
          id: invite.id,
          candidateName: data.candidateName,
          candidateEmail: data.candidateEmail,
          candidatePhone: data.candidatePhone,
          candidateCity: data.candidateCity ?? '',
          intendedFieldRole: data.intendedFieldRole,
          isIBO: data.isIBO ?? false,
          status: data.status,
          ownerName: data.ownerName,
          expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() ?? null,
        },
        items: [],
        locked: true,
      });
    }

    if (data.status === 'invited') {
      await invite.ref.set({ status: 'in_progress', updatedAt: new Date() }, { merge: true });
    }

    const items = getOnboardingItemsForUser(data.intendedFieldRole, data.isIBO ?? false);

    return NextResponse.json({
      invite: {
        id: invite.id,
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        candidatePhone: data.candidatePhone,
        candidateCity: data.candidateCity ?? '',
        intendedFieldRole: data.intendedFieldRole,
        isIBO: data.isIBO ?? false,
        status: data.status === 'invited' ? 'in_progress' : data.status,
        ownerName: data.ownerName,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() ?? null,
      },
      items,
      locked: false,
    });
  } catch (error) {
    console.error('Error loading public onboarding invite:', error);
    return NextResponse.json({ error: 'Failed to load onboarding invite' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ error: 'Firebase Admin is not configured' }, { status: 500 });
    }

    const { token } = await params;
    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const data = invite.data;
    if (isExpired(data.expiresAt)) {
      await invite.ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    if (['submitted', 'approved', 'converted'].includes(data.status)) {
      return NextResponse.json({ error: 'This onboarding packet was already submitted' }, { status: 400 });
    }

    const body = await request.json();
    const displayName = clean(body.displayName, 180) || data.candidateName;
    const phone = clean(body.phone, 80) || data.candidatePhone;
    const city = clean(body.city, 120) || data.candidateCity || '';
    const password = clean(body.password, 200);
    const references = body.references && typeof body.references === 'object'
      ? (body.references as Record<string, unknown>)
      : {};

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Create a portal password with at least 6 characters' },
        { status: 400 }
      );
    }

    const items = getOnboardingItemsForUser(data.intendedFieldRole, data.isIBO ?? false);
    const missing = items.filter((item) => !clean(references[item.id], 500));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Please complete every item before submitting: ${missing.map((i) => i.label).join(', ')}` },
        { status: 400 }
      );
    }

    const now = new Date();
    const userRecord = await adminAuth.createUser({
      email: data.candidateEmail,
      password,
      displayName,
    });

    const userProfile = {
      email: data.candidateEmail,
      displayName,
      fieldRole: data.intendedFieldRole,
      isIBO: data.isIBO ?? false,
      reportsToId: data.ownerId,
      managerId: data.ownerId,
      phone,
      city,
      status: 'pending',
      onboardingInviteId: invite.id,
      hireDate: now,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('users').doc(userRecord.uid), userProfile);

    const candidateItems = items.map((item) => ({
      itemId: item.id,
      label: item.label,
      status: 'submitted',
      reference: clean(references[item.id], 500),
    }));

    batch.set(adminDb.collection('candidateOnboarding').doc(invite.id), {
      inviteId: invite.id,
      candidateName: displayName,
      candidateEmail: data.candidateEmail,
      candidatePhone: phone,
      fieldRole: data.intendedFieldRole,
      isIBO: data.isIBO ?? false,
      convertedUserId: userRecord.uid,
      items: candidateItems,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    });

    for (const candidateItem of candidateItems) {
      batch.set(
        adminDb.collection('userOnboarding').doc(`${userRecord.uid}_${candidateItem.itemId}`),
        {
          userId: userRecord.uid,
          itemId: candidateItem.itemId,
          status: 'submitted',
          reference: candidateItem.reference,
          rejectionReason: null,
          submittedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    batch.set(
      invite.ref,
      {
        status: 'submitted',
        convertedUserId: userRecord.uid,
        candidateName: displayName,
        candidatePhone: phone,
        candidateCity: city,
        submittedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    if (data.applicationId) {
      batch.set(
        adminDb.collection('applications').doc(data.applicationId),
        {
          status: 'invited',
          convertedUserId: userRecord.uid,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    // The Auth user is created before the batch. If the batch fails, roll the
    // Auth user back so the recruit can resubmit; otherwise the next attempt
    // would hit auth/email-already-exists and the invite would be permanently
    // bricked with no Firestore record to recover from.
    try {
      await batch.commit();
    } catch (commitError) {
      await adminAuth.deleteUser(userRecord.uid).catch((rollbackError) => {
        console.error(
          'Failed to roll back orphaned Auth user after batch commit failure:',
          rollbackError
        );
      });
      throw commitError;
    }

    await adminDb.collection('notifications').add({
      userId: data.ownerId,
      type: 'onboarding_submitted',
      title: 'Recruit onboarding submitted',
      message: `${displayName} completed the website onboarding flow.`,
      link: '/portal/admin/recruiting',
      read: false,
      createdAt: now,
    });

    return NextResponse.json({ success: true, status: 'submitted' });
  } catch (error: unknown) {
    console.error('Error submitting public onboarding:', error);
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string };
      if (firebaseError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'A portal account already exists for this email' },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ error: 'Failed to submit onboarding' }, { status: 500 });
  }
}
