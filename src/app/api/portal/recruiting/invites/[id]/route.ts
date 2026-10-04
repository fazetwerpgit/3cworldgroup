import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createInviteToken, getInviteExpiration } from '@/lib/recruiting/tokens';
import { getRecruitingRequester } from '@/lib/recruiting/requester';
import { isInviteExpired } from '@/lib/recruiting/inviteLookup';
import { inviteUrlFor, openInviteToken, sealInviteToken, sendInviteEmail } from '@/lib/recruiting/inviteLink';

// One invite's link, for the manager who sent it (or management).
//   GET  -> { inviteUrl }: the saved link, to copy and send by hand.
//   POST -> re-sends the invite email and gives the next 14 days. The saved
//           link is kept, so the one already sent works again; an invite with
//           no saved link (made before links were saved) gets a fresh one.
// Only invites the recruit can still fill in qualify: a submitted, activated or
// rejected invite has no use for its link.

const OPEN_STATUSES = ['invited', 'in_progress', 'expired'];

type Loaded =
  | { ok: false; response: NextResponse }
  | { ok: true; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData };

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
  if (!OPEN_STATUSES.includes(data.status)) {
    return fail('This recruit already submitted their onboarding, so the link is closed.', 409);
  }
  return { ok: true, ref, data };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invite = await loadOpenInvite(request, id);
    if (!invite.ok) return invite.response;

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
    return NextResponse.json({ inviteUrl: inviteUrlFor(request.nextUrl.origin, token) });
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

    const inviteUrl = inviteUrlFor(request.nextUrl.origin, token);
    const emailSent = await sendInviteEmail(invite.data.candidateEmail, inviteUrl);
    return NextResponse.json({
      inviteUrl,
      emailSent,
      newLink: renewed,
      linkSaved: renewed ? 'tokenEncrypted' in update : true,
      status: invite.data.status === 'expired' ? 'invited' : invite.data.status,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error re-sending invite:', error);
    return NextResponse.json({ error: 'Failed to re-send the invite' }, { status: 500 });
  }
}
