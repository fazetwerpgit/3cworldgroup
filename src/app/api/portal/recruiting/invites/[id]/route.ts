import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createInviteToken, getInviteExpiration } from '@/lib/recruiting/tokens';
import { getRecruitingRequester, type RecruitingRequester } from '@/lib/recruiting/requester';
import { isInviteExpired } from '@/lib/recruiting/inviteLookup';
import { inviteEmailFields, inviteUrlFor, openInviteToken, sealInviteToken, sendInviteEmail } from '@/lib/recruiting/inviteLink';
import { saveInviteEmailStatus } from '@/lib/recruiting/inviteEmailStatus';

// One invite's link, for the manager who sent it (or management).
//   GET  -> { inviteUrl }: the saved link, to copy and send by hand. Never for
//           an invite to an email that already had an account.
//   POST -> re-sends the invite email and gives the next 14 days. The saved
//           link is kept, so the one already sent works again; an invite with
//           no saved link (made before links were saved) gets a fresh one.
//           If the recruit already opened the old one, a fresh token breaks
//           the page they have open (uploads are kept: they are stored by
//           invite id), so that needs { replaceOpenedLink: true }.
//   PATCH { action: 'cancel' } -> calls the invite off before the paperwork
//           comes back: status 'cancelled', and the link stops working. An
//           invite made from a website application puts that application back
//           to 'applied', so it shows in To do again.
// Only invites the recruit can still fill in qualify: a submitted, activated,
// rejected or cancelled invite has no use for its link.

const OPEN_STATUSES = ['invited', 'in_progress', 'expired'];

function closedMessage(status: unknown) {
  return status === 'cancelled'
    ? 'This invite was cancelled.'
    : 'This recruit already submitted their onboarding, so the link is closed.';
}

type Loaded =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.DocumentData;
      requester: RecruitingRequester;
    };

async function loadOpenInvite(request: NextRequest, id: string): Promise<Loaded> {
  const fail = (error: string, status: number): Loaded => ({
    ok: false,
    response: NextResponse.json({ error }, { status }),
  });
  if (!adminDb) return fail('Database not configured', 500);

  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);

  const requester = await getRecruitingRequester(gate.uid);
  if (!requester?.canManage) return fail('Forbidden', 403);

  const ref = adminDb.collection('onboardingInvites').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return fail('Invite not found', 404);
  const data = doc.data() ?? {};
  if (!requester.canViewAll && data.ownerId !== gate.uid) return fail('Forbidden', 403);
  if (!OPEN_STATUSES.includes(data.status)) return fail(closedMessage(data.status), 409);
  return { ok: true, ref, data, requester };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invite = await loadOpenInvite(request, id);
    if (!invite.ok) return invite.response;

    // The email already had an account when invited: the link is only ever
    // emailed to that inbox, never shown to the inviter.
    if (invite.data.accountExistedAtInvite === true) {
      return NextResponse.json(
        { error: 'This person already has an account, so their link only goes to their email. Use Resend email.' },
        { status: 409 }
      );
    }
    const token = openInviteToken(invite.data.tokenEncrypted);
    if (!token) {
      return NextResponse.json(
        { error: 'This invite was sent before links were saved. Use Resend email to send them a new link.' },
        { status: 409 }
      );
    }
    if (invite.data.status === 'expired' || isInviteExpired(invite.data.expiresAt)) {
      return NextResponse.json(
        { error: 'This link has expired. Use Resend email to renew it for 14 more days.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ inviteUrl: inviteUrlFor(token) });
  } catch (error) {
    console.error('Error reading invite link:', error);
    return NextResponse.json({ error: 'Failed to load the invite link' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invite = await loadOpenInvite(request, id);
    if (!invite.ok) return invite.response;

    let token = openInviteToken(invite.data.tokenEncrypted);
    const renewed = !token;
    const update: Record<string, unknown> = {};
    if (!token) {
      const opened = invite.data.status === 'in_progress' && !isInviteExpired(invite.data.expiresAt);
      const body: unknown = await request.json().catch(() => null);
      const confirmed =
        typeof body === 'object' && body !== null && 'replaceOpenedLink' in body && body.replaceOpenedLink === true;
      if (opened && !confirmed) {
        return NextResponse.json(
          {
            error: 'They already opened the link from their first email. Sending a new one replaces it.',
            code: 'opened_link',
          },
          { status: 409 }
        );
      }
      const fresh = createInviteToken();
      token = fresh.token;
      const tokenEncrypted = sealInviteToken(fresh.token);
      update.tokenHash = fresh.tokenHash;
      if (tokenEncrypted) update.tokenEncrypted = tokenEncrypted;
    }
    const now = new Date();
    const expiresAt = getInviteExpiration(14);
    await invite.ref.update({
      ...update,
      expiresAt,
      // An expired invite opens again; one in progress keeps its status.
      ...(invite.data.status === 'expired' ? { status: 'invited' } : {}),
      updatedAt: now,
    });

    const inviteUrl = inviteUrlFor(token);
    const email = await sendInviteEmail(invite.data.candidateEmail, inviteUrl, id);
    const emailSent = email.sent;
    await saveInviteEmailStatus(invite.ref, inviteEmailFields(email));
    return NextResponse.json({
      ...(invite.data.accountExistedAtInvite === true ? {} : { inviteUrl }),
      emailSent,
      newLink: renewed,
      linkSaved: renewed ? 'tokenEncrypted' in update : true,
      emailStatus: emailSent ? 'sent' : 'failed',
      status: invite.data.status === 'expired' ? 'invited' : invite.data.status,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error re-sending invite:', error);
    return NextResponse.json({ error: 'Failed to re-send the invite' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Same gate as the link and Resend: management and recruiters on any
    // invite, a field manager only on the ones they sent.
    const invite = await loadOpenInvite(request, id);
    if (!invite.ok) return invite.response;
    const body: unknown = await request.json().catch(() => null);
    const action = typeof body === 'object' && body !== null && 'action' in body ? body.action : null;
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const db = adminDb;
    if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const { ref, requester } = invite;

    // Read again inside the transaction: the recruit may send the packet back
    // (or another manager cancel it) between the check above and this write.
    const outcome = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const data = fresh.data() ?? {};
      if (!fresh.exists) return { ok: false as const, status: 404, error: 'Invite not found' };
      if (!OPEN_STATUSES.includes(data.status)) {
        return { ok: false as const, status: 409, error: closedMessage(data.status) };
      }
      const applicationId = typeof data.applicationId === 'string' && data.applicationId ? data.applicationId : null;
      const applicationRef = applicationId ? db.collection('applications').doc(applicationId) : null;
      const application = applicationRef ? await tx.get(applicationRef) : null;

      const now = new Date();
      tx.update(ref, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: requester.uid,
        cancelledByName: requester.name,
        updatedAt: now,
      });
      // The application this invite came from goes back to waiting in To do,
      // unless it has moved on since (another invite, Not a fit, a hire).
      let applicationReopened = false;
      if (applicationRef && application?.exists) {
        const app = application.data() ?? {};
        const linkedHere = app.inviteId === undefined || app.inviteId === id;
        if (app.status === 'invited' && linkedHere && !app.convertedUserId) {
          tx.update(applicationRef, { status: 'applied', inviteId: FieldValue.delete(), updatedAt: now });
          applicationReopened = true;
        }
      }
      return { ok: true as const, cancelledAt: now, applicationReopened };
    });

    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({
      status: 'cancelled',
      cancelledAt: outcome.cancelledAt.toISOString(),
      cancelledByName: requester.name,
      applicationReopened: outcome.applicationReopened,
    });
  } catch (error) {
    console.error('Error cancelling invite:', error);
    return NextResponse.json({ error: 'Failed to cancel the invite' }, { status: 500 });
  }
}
