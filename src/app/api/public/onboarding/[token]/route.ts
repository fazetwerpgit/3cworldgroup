import { after, NextRequest, NextResponse } from 'next/server';
import { notifyOnboardingSubmitted } from '@/lib/onboarding/ownerNotify';
import { DISPLAY_NAME_TAKEN_ERROR, isDisplayNameTaken } from '@/lib/users/displayNameTaken';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  CLOSED_INVITE_STATUSES,
  getInviteByToken,
  isInviteExpired,
  SUBMITTED_INVITE_STATUSES,
} from '@/lib/recruiting/inviteLookup';
import { getOnboardingItemsForUser, looksLikeRawSensitiveData, requiresHeavyVetting } from '@/types';
import { isShirtSize } from '@/types/auth';
import type { SensitiveDoc } from '@/types/sensitive';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { verifyStorageReference } from '@/lib/onboarding/verifyStorageReference';
import { validateAddress } from '@/lib/validation/address';
import { buildSensitiveDoc } from '@/lib/onboarding/sensitiveFields';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { isEsignItem } from '@/lib/onboarding/esign';
import { findActivePortalAccount, findAuthAccount, findOnboardingPortalAccount } from '@/lib/auth/existingAccount';
import { issueSigningSession } from '@/lib/onboarding/inviteSigning';

/**
 * Only a packet still being filled in can lapse. A submitted, approved,
 * converted or rejected invite keeps its status past expiresAt, so a late tap
 * on the old email can't flip it to 'expired' (which reopens it for Resend).
 */
function lapsedOpenInvite(data: { status?: unknown; expiresAt?: FirebaseFirestore.Timestamp }) {
  return (data.status === 'invited' || data.status === 'in_progress') && isInviteExpired(data.expiresAt);
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** The uid of a valid Firebase ID token on the request, if any. */
async function signedInUid(request: NextRequest): Promise<string | null> {
  if (!adminAuth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  try {
    return (await adminAuth.verifyIdToken(match[1])).uid;
  } catch {
    return null;
  }
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
    if (data.status === 'expired') {
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    if (lapsedOpenInvite(data)) {
      await invite.ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }

    const lockedView = (extra: Record<string, unknown> = {}) =>
      NextResponse.json({
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
        ...extra,
      });

    if (CLOSED_INVITE_STATUSES.includes(data.status)) {
      return lockedView({ closed: true });
    }

    if (SUBMITTED_INVITE_STATUSES.includes(data.status)) {
      return lockedView();
    }

    const existingAccount = await findActivePortalAccount(data.candidateEmail);
    if (existingAccount) {
      return lockedView({ existingAccount: true });
    }

    // Same rule as the POST: someone midway through another invite's
    // onboarding can't send this packet, so say so before any data entry.
    const onboarding = await findOnboardingPortalAccount(data.candidateEmail);
    if (onboarding && onboarding.onboardingInviteId !== invite.id) {
      return lockedView({ onboardingElsewhere: true });
    }

    // A login already exists for this email (a past hire, a self-signup, or
    // one made since the invite): the hire signs in with its password rather
    // than creating one, and the link never resets it.
    const signInRequired =
      data.accountExistedAtInvite === true || (await findAuthAccount(data.candidateEmail)) !== null;

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
      ...(signInRequired ? { signInRequired: true } : {}),
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
    if (lapsedOpenInvite(data)) {
      await invite.ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    if (CLOSED_INVITE_STATUSES.includes(data.status)) {
      return NextResponse.json(
        { error: 'This onboarding link is closed. Contact your manager if you think this is a mistake.' },
        { status: 409 }
      );
    }
    if (SUBMITTED_INVITE_STATUSES.includes(data.status)) {
      return NextResponse.json({ error: 'This onboarding packet was already submitted' }, { status: 400 });
    }

    const body = await request.json();
    const displayName = clean(body.displayName, 180) || data.candidateName;
    const phone = clean(body.phone, 80) || data.candidatePhone;
    const city = clean(body.city, 120) || data.candidateCity || '';
    const addressCheck = validateAddress({
      address: body.address,
      city,
      state: body.state,
      zip: body.zip,
    });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }
    const addressFields = addressCheck.clean;
    const password = clean(body.password, 200);
    const accountType = body.accountType || undefined;
    const taxClassification = body.taxClassification || undefined;
    if (accountType !== undefined && !['checking', 'savings'].includes(accountType)) {
      return NextResponse.json({ error: 'Invalid accountType' }, { status: 400 });
    }
    if (taxClassification !== undefined && !['individual', 'llc'].includes(taxClassification)) {
      return NextResponse.json({ error: 'Invalid taxClassification' }, { status: 400 });
    }
    const references = body.references && typeof body.references === 'object'
      ? (body.references as Record<string, unknown>)
      : {};

    // An email that already has a login is claimed only by signing in to it.
    // The link never sets that login's password: the invite is made by a
    // manager, and setting it would hand them someone else's account.
    // (accountExistedAtInvite is checked by the GET; Auth is checked live here,
    // which also covers a login made after the invite. If the login behind
    // such an invite is gone, a fresh one is created, so no one is displaced.)
    const existingAuth = await findAuthAccount(data.candidateEmail);
    let existingUserData: Record<string, unknown> | undefined;
    if (existingAuth) {
      const existingDoc = await adminDb.collection('users').doc(existingAuth.uid).get();
      existingUserData = existingDoc.exists ? existingDoc.data() : undefined;
      // Never an active account, a back-office account, or a hire midway
      // through someone else's onboarding, even when signed in.
      const status = existingUserData?.status;
      const platformRole =
        typeof existingUserData?.role === 'string' && ['owner', 'admin', 'operations'].includes(existingUserData.role);
      const onboardingElsewhere =
        status === 'pending' && !!existingUserData?.fieldRole && existingUserData?.onboardingInviteId !== invite.id;
      if (existingDoc.exists && (status === 'active' || platformRole || onboardingElsewhere)) {
        return NextResponse.json(
          {
            error: onboardingElsewhere
              ? 'This email is already onboarding with 3C. Sign in at the portal to continue, or contact your manager.'
              : 'This email already has an active portal account. Sign in at the portal instead, or contact your manager.',
          },
          { status: 409 }
        );
      }
      if ((await signedInUid(request)) !== existingAuth.uid) {
        return NextResponse.json(
          {
            error: `${data.candidateEmail} already has a portal account. Sign in with its password to continue, or reset the password from the email we send to that address.`,
            code: 'sign_in_required',
          },
          { status: 401 }
        );
      }
    } else if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Create a portal password with at least 6 characters' },
        { status: 400 }
      );
    }

    if (!isShirtSize(body.shirtSize)) {
      return NextResponse.json({ error: 'Pick a shirt size', field: 'shirtSize' }, { status: 400 });
    }
    const shirtSize = body.shirtSize;

    const heavyVetting = requiresHeavyVetting(data.intendedFieldRole);
    // Heavy vetting runs a background / drug screen: it needs the SSN and the
    // candidate's authorization.
    if (heavyVetting && !clean(body.ssn, 40)) {
      return NextResponse.json({ error: 'Enter your Social Security number', field: 'ssn' }, { status: 400 });
    }
    if (heavyVetting && body.backgroundCheckAuth !== true) {
      return NextResponse.json(
        { error: 'Check the box to authorize the background / drug screen', field: 'backgroundCheckAuth' },
        { status: 400 }
      );
    }
    const items = getOnboardingItemsForUser(data.intendedFieldRole, data.isIBO ?? false);
    // The license item needs the typed number as well as both photos.
    const needsDlNumber = items.some((item) => item.id === 'dl_photos');
    if (needsDlNumber && !clean(body.dlNumber, 40)) {
      return NextResponse.json({ error: "Enter your driver's license number", field: 'dlNumber' }, { status: 400 });
    }
    const missing = items.filter(
      (item) => !isEsignItem(item.id) && !clean(references[item.id], 500)
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Please complete every item before submitting: ${missing.map((i) => i.label).join(', ')}` },
        { status: 400 }
      );
    }

    // Sensitive items must carry a reference/vendor token, never raw PII.
    const rawSensitive = items.filter(
      (item) =>
        !isEsignItem(item.id) &&
        item.sensitive &&
        looksLikeRawSensitiveData(clean(references[item.id], 500))
    );
    if (rawSensitive.length > 0) {
      return NextResponse.json(
        {
          error: `These items look like raw card/SSN/account numbers - enter a reference or vendor token only: ${rawSensitive
            .map((i) => i.label)
            .join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Storage items: each reference must be this invite's own folder and the
    // required file(s) must exist. Blocks pointing at another invite's folder
    // and empty/partial uploads.
    for (const item of items) {
      if (!isStorageItem(item.id)) continue;
      const verified = await verifyStorageReference(
        { kind: 'invite', inviteId: invite.id },
        item.id,
        clean(references[item.id], 500)
      );
      if (!verified.ok) {
        return NextResponse.json(
          { error: `${item.label}: ${verified.error}` },
          { status: 400 }
        );
      }
    }

    // Sensitive fields (SSN, DL#, background-check auth) travel as their own body
    // keys, NEVER inside the references map, so the looksLikeRawSensitiveData
    // guardrail on references is not triggered. They are encrypted before storage.
    let sensitiveDoc: Partial<SensitiveDoc> = {};
    if (heavyVetting || needsDlNumber) {
      const sensitive = buildSensitiveDoc({
        ssn: typeof body.ssn === 'string' ? body.ssn : undefined,
        dlNumber: typeof body.dlNumber === 'string' ? body.dlNumber : undefined,
        backgroundCheckAuth:
          typeof body.backgroundCheckAuth === 'boolean' ? body.backgroundCheckAuth : undefined,
      });
      if (!sensitive.ok) {
        return NextResponse.json({ error: sensitive.error, field: sensitive.field }, { status: 400 });
      }
      sensitiveDoc = sensitive.doc;
    }

    // No exact copy of another user's name (lib/users/displayNameTaken). The
    // account being finished here (existingAuth) is not "another".
    if (await isDisplayNameTaken(adminDb, displayName, existingAuth?.uid ?? null)) {
      return NextResponse.json({ error: DISPLAY_NAME_TAKEN_ERROR, field: 'displayName' }, { status: 400 });
    }

    const now = new Date();
    let userRecord: { uid: string };
    let createdAuthUser = false;
    if (existingAuth) {
      // Signed in above as this very account. Its password is left alone.
      userRecord = existingAuth;
    } else {
      userRecord = await adminAuth.createUser({ email: data.candidateEmail, password, displayName });
      createdAuthUser = true;
    }

    const userProfile = {
      email: data.candidateEmail,
      displayName,
      fieldRole: data.intendedFieldRole,
      isIBO: data.isIBO ?? false,
      reportsToId: data.ownerId,
      managerId: data.ownerId,
      phone,
      ...addressFields,
      shirtSize,
      status: 'pending',
      onboardingInviteId: invite.id,
      hireDate: now,
      createdAt: existingUserData?.createdAt ?? now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection('users').doc(userRecord.uid), userProfile);

    // Write the encrypted sensitive doc only when there is something to store.
    if (Object.keys(sensitiveDoc).length > 0) {
      batch.set(adminDb.collection('userSensitive').doc(userRecord.uid), {
        ...sensitiveDoc,
        updatedAt: now,
        updatedBy: userRecord.uid,
      });
    }

    const candidateItems = items.map((item) =>
      isEsignItem(item.id)
        ? {
            itemId: item.id,
            label: item.label,
            status: 'not_started' as const,
            ...(item.id === 'direct_deposit' && accountType ? { prefill: { accountType } } : {}),
            ...(item.id === 'w9' && taxClassification ? { prefill: { taxClassification } } : {}),
          }
        : {
            itemId: item.id,
            label: item.label,
            status: 'submitted' as const,
            reference: clean(references[item.id], 500),
          }
    );

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

    // Every item starts over for this packet, replacing (not merging into) any
    // doc left by an earlier hire on a claimed account: e-sign items lose the
    // old envelope so fresh ones are sent, and nothing approved before counts
    // toward this activation.
    for (const candidateItem of candidateItems) {
      batch.set(
        adminDb.collection('userOnboarding').doc(`${userRecord.uid}_${candidateItem.itemId}`),
        candidateItem.status === 'not_started'
          ? {
              userId: userRecord.uid,
              itemId: candidateItem.itemId,
              status: 'not_started',
              ...('prefill' in candidateItem ? { prefill: candidateItem.prefill } : {}),
              updatedAt: now,
            }
          : {
              userId: userRecord.uid,
              itemId: candidateItem.itemId,
              status: 'submitted',
              reference: candidateItem.reference,
              rejectionReason: null,
              submittedAt: now,
              updatedAt: now,
            }
      );
    }

    // The hire signs every document on the next screen, so this response
    // carries a one-time signing key for it (see inviteSigning).
    const signOnTheSpot = items.some((item) => isEsignItem(item.id));
    const signingSession = signOnTheSpot ? issueSigningSession(userRecord.uid, now) : null;

    batch.set(
      invite.ref,
      {
        ...(signingSession ? { esignSession: signingSession.record } : {}),
        status: 'submitted',
        convertedUserId: userRecord.uid,
        accountCreatedByInvite: createdAuthUser,
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
      if (createdAuthUser) await adminAuth.deleteUser(userRecord.uid).catch((rollbackError) => {
        console.error(
          'Failed to roll back orphaned Auth user after batch commit failure:',
          rollbackError
        );
      });
      throw commitError;
    }

    if (signingSession) {
      // The envelopes must exist when the signing step loads, so they are
      // created now, not after the response. The "ready to sign" email is held
      // back: the hire is about to sign, and the daily cron sends it only if
      // something is still unsigned later. Failure-contained: the step's load
      // call retries whatever did not go out.
      await sendPendingEsignDocs(userRecord.uid, { deferReadyEmail: true });
    }

    // The website form is the hire's onboarding submission: its item just went
    // into 'submitted', and the invite's 'submitted' status (checked above)
    // stops a second POST. Owners get one email; a failure never fails this.
    // The old doc is folded in so a claimed test/demo account stays silent.
    if (candidateItems.some((item) => item.itemId === 'onboarding_submission' && item.status === 'submitted')) {
      const alertUser = { ...existingUserData, ...userProfile };
      after(() => notifyOnboardingSubmitted({ userId: userRecord.uid, user: alertUser, submittedAt: now }));
    }

    try {
      await adminDb.collection('notifications').add({
        userId: data.ownerId,
        type: 'onboarding_submitted',
        title: 'Recruit onboarding submitted',
        message: `${displayName} completed the website onboarding flow.`,
        link: '/portal/admin/onboarding?tab=people&stage=ready',
        read: false,
        createdAt: now,
      });
    } catch (notificationError) {
      console.error('Failed to create onboarding notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      status: 'submitted',
      ...(signingSession ? { signingKey: signingSession.key } : {}),
    });
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
