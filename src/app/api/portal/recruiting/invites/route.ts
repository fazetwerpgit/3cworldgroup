import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  ApplicationRecord,
  FieldRole,
  OnboardingInvite,
  resolveRoles,
} from '@/types';
import { createInviteToken, getInviteExpiration } from '@/lib/recruiting/tokens';

const VALID_FIELD_ROLES: FieldRole[] = ['entry_rep', 'l1_manager', 'l2_manager'];

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function getRequester(userId: string) {
  if (!adminDb) return null;
  const doc = await adminDb.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
  const canManage =
    role === 'admin' ||
    role === 'operations' ||
    fieldRole === 'l1_manager' ||
    fieldRole === 'l2_manager';
  return {
    uid: userId,
    role,
    fieldRole,
    canManage,
    canViewAll: role === 'admin' || role === 'operations',
    name: data?.displayName || data?.email || '3C Manager',
  };
}

function serializeInvite(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id,
    candidateName: data.candidateName,
    candidateEmail: data.candidateEmail,
    candidatePhone: data.candidatePhone,
    candidateCity: data.candidateCity ?? '',
    intendedFieldRole: data.intendedFieldRole,
    isIBO: data.isIBO ?? false,
    status: data.status,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    applicationId: data.applicationId ?? null,
    convertedUserId: data.convertedUserId ?? null,
    expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() ?? null,
    submittedAt: data.submittedAt?.toDate?.()?.toISOString?.() ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

function serializeApplication(doc: FirebaseFirestore.QueryDocumentSnapshot): ApplicationRecord {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    city: data.city ?? '',
    referredBy: data.referredBy ?? '',
    status: data.status ?? 'applied',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  } as unknown as ApplicationRecord;
}

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const requester = await getRequester(userId);
    if (!requester?.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const inviteSnapshot = await adminDb
      .collection('onboardingInvites')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const invites = inviteSnapshot.docs
      .filter((doc) => requester.canViewAll || doc.data().ownerId === userId)
      .map(serializeInvite);

    const applicationSnapshot = await adminDb
      .collection('applications')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return NextResponse.json({
      invites,
      applications: applicationSnapshot.docs.map(serializeApplication),
      canViewAll: requester.canViewAll,
    });
  } catch (error) {
    console.error('Error loading recruiting invites:', error);
    return NextResponse.json({ error: 'Failed to load recruiting data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const requestedBy = clean(body.requestedBy);
    const candidateName = clean(body.candidateName);
    const candidateEmail = clean(body.candidateEmail, 180).toLowerCase();
    const candidatePhone = clean(body.candidatePhone, 80);
    const candidateCity = clean(body.candidateCity, 120);
    const applicationId = clean(body.applicationId, 120);
    const intendedFieldRole = clean(body.intendedFieldRole, 40) as FieldRole;
    const isIBO = body.isIBO === true;

    if (!requestedBy || !candidateName || !candidateEmail || !candidatePhone) {
      return NextResponse.json(
        { error: 'Manager, candidate name, email, and phone are required' },
        { status: 400 }
      );
    }
    if (!VALID_FIELD_ROLES.includes(intendedFieldRole)) {
      return NextResponse.json({ error: 'Invalid field role' }, { status: 400 });
    }

    const requester = await getRequester(requestedBy);
    if (!requester?.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { token, tokenHash } = createInviteToken();
    const now = new Date();
    const expiresAt = getInviteExpiration(14);
    const inviteRef = await adminDb.collection('onboardingInvites').add({
      candidateName,
      candidateEmail,
      candidatePhone,
      candidateCity,
      intendedFieldRole,
      isIBO,
      status: 'invited',
      ownerId: requestedBy,
      ownerName: requester.name,
      tokenHash,
      ...(applicationId ? { applicationId } : {}),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    } satisfies Omit<OnboardingInvite, 'id'>);

    if (applicationId) {
      await adminDb.collection('applications').doc(applicationId).set(
        {
          status: 'invited',
          inviteId: inviteRef.id,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    const inviteUrl = `${request.nextUrl.origin}/onboard/${token}`;

    return NextResponse.json({
      success: true,
      invite: {
        id: inviteRef.id,
        candidateName,
        candidateEmail,
        candidatePhone,
        candidateCity,
        intendedFieldRole,
        isIBO,
        status: 'invited',
        ownerId: requestedBy,
        ownerName: requester.name,
        applicationId: applicationId || null,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      inviteUrl,
    });
  } catch (error) {
    console.error('Error creating onboarding invite:', error);
    return NextResponse.json({ error: 'Failed to create onboarding invite' }, { status: 500 });
  }
}
