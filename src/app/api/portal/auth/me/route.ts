import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { purgeSensitiveUserData } from '@/lib/users/purgeSensitiveUserData';
import {
  DELETED_USER_NAME,
  LastOwnerError,
  anonymizedProfileUpdate,
  beginSelfDelete,
  hasOtherActiveOwner,
} from '@/lib/users/accountClosure';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { restampAuthor } from '@/lib/chat/restampAuthor';
import { writeAdminAudit } from '@/lib/audit/adminAudit';

const FEDERATED_PROVIDERS = ['google.com', 'apple.com'];

// DELETE /api/portal/auth/me — the signed-in person deletes their own account
// (SPEC A3; App Store guideline 5.1.1(v)). The uid comes from the verified ID
// token only. The token is verified here directly (like signup-notify), not
// through requireVerifiedUser: an unapproved self-signup (pending, no role)
// must be able to withdraw too, from the pending-approval screen. Active and
// pending accounts may delete; an inactive one only to finish a delete it
// already started (selfDeleted), which a disabled sign-in cannot reach. The admin route (users/[id]) refuses self-deletion; this is the
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
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
    let uid: string;
    try {
      // checkRevoked: a disabled (already deleted) sign-in is refused here.
      uid = (await adminAuth.verifyIdToken(token, true)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const docRef = adminDb.collection('users').doc(uid);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const status = doc.get('status');
    const resuming = status === 'inactive' && doc.get('selfDeleted') === true;
    if (status !== 'active' && status !== 'pending' && !resuming) {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
    }

    const lastOwnerResponse = () =>
      NextResponse.json(
        { error: 'You are the last active owner. Make someone else an owner before deleting your account.' },
        { status: 409 }
      );
    // Same rule as the admin route: never remove the last active owner. A
    // quick check here; the race-safe one runs in beginSelfDelete below.
    if (doc.get('role') === 'owner' && status === 'active' && !(await hasOtherActiveOwner(adminDb, uid))) {
      return lastOwnerResponse();
    }

    const previousStatus = status ?? null;
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
        { error: "We couldn't finish deleting your account. Try again in a minute." },
        { status: 500 }
      );
    }

    // 2. Inside a transaction: re-check the last-owner rule against the live
    //    owner list and flip this account to inactive + selfDeleted, so two
    //    owners deleting at once cannot both pass, and the account is out of
    //    every active list before the sign-in closes. A retry of a delete that
    //    stopped later on passes straight through.
    if (!resuming) {
      try {
        await beginSelfDelete(adminDb, uid);
      } catch (error) {
        if (error instanceof LastOwnerError) return lastOwnerResponse();
        throw error;
      }
    }

    // 3. Close the sign-in: disable, strip what identifies the person, free
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
        { error: "We couldn't finish deleting your account. Try again in a minute." },
        { status: 500 }
      );
    }

    // 4. Anonymize the profile. The sign-in is already closed, so a failure
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

    // 5. Best-effort follow-ups, as in the admin route: the account is already
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
