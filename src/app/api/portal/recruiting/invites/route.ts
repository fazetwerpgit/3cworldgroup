import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  ApplicationRecord,
  FieldRole,
  INVITABLE_FIELD_ROLES,
  OnboardingInvite,
} from '@/types';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createInviteToken, getInviteExpiration } from '@/lib/recruiting/tokens';
import { getRecruitingRequester } from '@/lib/recruiting/requester';
import { inviteUrlFor, sealInviteToken, sendInviteEmail } from '@/lib/recruiting/inviteLink';
import { findActivePortalAccount, findOnboardingPortalAccount } from '@/lib/auth/existingAccount';

const APPLICATION_LIMIT = 1000;

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
    linkSaved: typeof data.tokenEncrypted === 'string',
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
    interests: Array.isArray(data.interests) ? data.interests : [],
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

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const userId = gate.uid;

    const requester = await getRecruitingRequester(userId);
    if (!requester?.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A manager's own invites are queried by owner, so company-wide volume never
    // pushes them out. Management also gets every invite awaiting Activate, so an
    // old submitted one never falls off the newest-100 window (or the badge).
    const invitesRef = adminDb.collection('onboardingInvites');
    const snapshots = requester.canViewAll
      ? await Promise.all([
          invitesRef.orderBy('createdAt', 'desc').limit(100).get(),
          invitesRef.where('status', '==', 'submitted').get(),
        ])
      : [await invitesRef.where('ownerId', '==', userId).get()];
    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snapshot of snapshots) for (const doc of snapshot.docs) byId.set(doc.id, doc);
    const createdMs = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      doc.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
    const invites = [...byId.values()].sort((a, b) => createdMs(b) - createdMs(a)).map(serializeInvite);

    // Every application, newest first. The cap is only a safety net; the
    // panel filters and searches the whole list client-side.
    const applicationSnapshot = await adminDb
      .collection('applications')
      .orderBy('createdAt', 'desc')
      .limit(APPLICATION_LIMIT)
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

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const requestedBy = gate.uid;

    const body = await request.json();
    const candidateName = clean(body.candidateName);
    const candidateEmail = clean(body.candidateEmail, 180).toLowerCase();
    const candidatePhone = clean(body.candidatePhone, 80);
    const candidateCity = clean(body.candidateCity, 120);
    const applicationId = clean(body.applicationId, 120);
    const intendedFieldRole = clean(body.intendedFieldRole, 40) as FieldRole;
    const isIBO = body.isIBO === true;

    if (!candidateName || !candidateEmail || !candidatePhone) {
      return NextResponse.json(
        { error: 'Candidate name, email, and phone are required' },
        { status: 400 }
      );
    }
    if (!INVITABLE_FIELD_ROLES.includes(intendedFieldRole)) {
      return NextResponse.json({ error: 'Invalid field role' }, { status: 400 });
    }

    const requester = await getRecruitingRequester(requestedBy);
    if (!requester?.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (await findActivePortalAccount(candidateEmail)) {
      return NextResponse.json(
        { error: 'This email already has an active portal account. They can sign in with it instead.' },
        { status: 409 }
      );
    }
    if (await findOnboardingPortalAccount(candidateEmail)) {
      return NextResponse.json(
        { error: 'This email is already partway through onboarding with 3C. Ask them to finish that invite, or contact an admin.' },
        { status: 409 }
      );
    }

    const { token, tokenHash } = createInviteToken();
    const tokenEncrypted = sealInviteToken(token);
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
      ...(tokenEncrypted ? { tokenEncrypted } : {}),
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

    const inviteUrl = inviteUrlFor(request.nextUrl.origin, token);
    const emailSent = await sendInviteEmail(candidateEmail, inviteUrl);

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
        linkSaved: tokenEncrypted !== null,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      inviteUrl,
      emailSent,
    });
  } catch (error) {
    console.error('Error creating onboarding invite:', error);
    return NextResponse.json({ error: 'Failed to create onboarding invite' }, { status: 500 });
  }
}
