import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { purgeSensitiveUserData } from '@/lib/users/purgeSensitiveUserData';
import { DELETED_USER_NAME, anonymizedProfileUpdate, hasOtherActiveOwner } from '@/lib/users/accountClosure';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { restampAuthor } from '@/lib/chat/restampAuthor';
import { writeAdminAudit } from '@/lib/audit/adminAudit';

const FEDERATED_PROVIDERS = ['google.com', 'apple.com'];

// DELETE /api/portal/auth/me — the signed-in person deletes their own account
// (SPEC A3; App Store guideline 5.1.1(v)). The uid comes from the verified ID
// token only. The admin route (users/[id]) refuses self-deletion; this is the
// self-service path and reuses its cleanup: identity documents are purged, the
// sign-in is disabled and its tokens revoked, open alerts close and chat
// membership is reconciled.
//
// Unlike the admin hard delete, the users doc is kept but anonymized, and
// sales / pay records are untouched: payroll and carrier reconciliation need
// them (decided 2026-10-16, stated on /privacy).
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ error: 'Firebase Admin is not configured' }, { status: 500 });
    }
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const uid = gate.uid;

    const docRef = adminDb.collection('users').doc(uid);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Same rule as the admin route: never remove the last active owner.
    if (doc.get('role') === 'owner' && doc.get('status') === 'active' && !(await hasOtherActiveOwner(adminDb, uid))) {
      return NextResponse.json(
        {
          error:
            'You are the last active owner. Make someone else an owner before deleting your account.',
        },
        { status: 409 }
      );
    }

    const previousStatus = doc.get('status') ?? null;
    const role = doc.get('fieldRole') ?? doc.get('role') ?? null;
    const audit = (completed: boolean, details: Record<string, unknown> = {}) =>
      writeAdminAudit({
        action: 'user.self_delete',
        actorUid: uid,
        // The audit row keeps the uid (it ties the kept sales records
        // together), never the person's name or contact details.
        actorName: DELETED_USER_NAME,
        targetUid: uid,
        details: { completed, role, status: previousStatus, ...details },
      });

    // 1. Identity documents first, while the account still works: on a failed
    //    step nothing else has changed and the person can simply try again.
    const purge = await purgeSensitiveUserData(uid);
    if (purge.failures.length > 0) {
      await audit(false, { stage: 'purge', purgeFailures: purge.failures });
      return NextResponse.json(
        { error: "We couldn't delete your account just now. Nothing was changed. Try again in a minute." },
        { status: 500 }
      );
    }

    // 2. Close the sign-in: disable, strip what identifies the person, free
    //    their Google / Apple identity, and revoke issued refresh tokens.
    try {
      const authUser = await adminAuth.getUser(uid);
      const providersToUnlink = authUser.providerData
        .map((info) => info.providerId)
        .filter((id) => FEDERATED_PROVIDERS.includes(id));
      await adminAuth.updateUser(uid, {
        disabled: true,
        displayName: null,
        photoURL: null,
        email: `deleted-${uid}@deleted.invalid`,
        ...(providersToUnlink.length ? { providersToUnlink } : {}),
      });
      await adminAuth.revokeRefreshTokens(uid);
    } catch (error) {
      console.error('[auth/me] failed to close the sign-in', uid, error);
      await audit(false, { stage: 'auth' });
      return NextResponse.json(
        { error: "We couldn't delete your account just now. Try again in a minute." },
        { status: 500 }
      );
    }

    // 3. Anonymize the profile. The sign-in is already closed, so a failure
    //    here cannot be retried by the person: say so, and log it loudly.
    try {
      await docRef.update(anonymizedProfileUpdate(previousStatus));
    } catch (error) {
      console.error('[auth/me] sign-in closed but profile anonymization failed', uid, error);
      await audit(false, { stage: 'profile' });
      return NextResponse.json(
        { error: 'Your sign-in is closed, but we could not finish removing your details. Contact your manager.' },
        { status: 500 }
      );
    }

    // 4. Best-effort follow-ups, as in the admin route: the account is already
    //    closed, so none of these may turn the delete into an error.
    try {
      await restampAuthor(uid, { authorName: DELETED_USER_NAME });
    } catch (error) {
      console.error('[auth/me] failed to re-stamp chat author name', uid, error);
    }
    try {
      await reconcileChatMembershipForUser(uid);
    } catch (error) {
      console.error('[auth/me] failed to reconcile chat membership', uid, error);
    }
    try {
      await resolveAlertTasks(uid);
    } catch (error) {
      console.error('[auth/me] failed to resolve open alerts', uid, error);
    }

    await audit(true, { purge: { userSensitive: purge.userSensitive, files: purge.files } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting own account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
