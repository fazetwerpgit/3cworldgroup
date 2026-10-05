import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { buildEnvelopeView, type EnvelopeView } from '@/lib/esign/envelopeView';
import { loadEnvelope } from '@/lib/esign/inhouse';
import {
  authorizeInviteSigning,
  closeSigningSession,
  SIGNING_KEY_HEADER,
} from '@/lib/onboarding/inviteSigning';

export type InviteSignDocState = 'ready' | 'signed' | 'preparing' | 'failed';

export interface InviteSignDocument {
  itemId: string;
  label: string;
  state: InviteSignDocState;
  envelope: EnvelopeView | null;
}

export interface InviteSignView {
  signerName: string;
  documents: InviteSignDocument[];
}

// GET /api/public/onboarding/{token}/esign — the invite link's sign-all step.
// Makes sure every document has its envelope (idempotent: sendPendingEsignDocs
// claims each item and skips the ones already sent, and holds back the
// ready-to-sign email), then lists them with what each signing form needs.
// Credential: the invite token plus the signing key from the packet submit.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const auth = await authorizeInviteSigning(token, request.headers.get(SIGNING_KEY_HEADER));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, ...(auth.done ? { done: true } : {}) }, { status: auth.status });
    }
    const { userId, user, items } = auth;

    await sendPendingEsignDocs(userId, { deferReadyEmail: true });

    const documents: InviteSignDocument[] = [];
    for (const item of items) {
      const snap = await adminDb!.doc(`userOnboarding/${userId}_${item.id}`).get();
      const base = { itemId: item.id, label: item.label };
      if (snap.get('status') === 'approved') {
        documents.push({ ...base, state: 'signed', envelope: null });
        continue;
      }
      const envelopeId = snap.get('esignEnvelopeId');
      const envelope = typeof envelopeId === 'string' && envelopeId ? await loadEnvelope(envelopeId) : null;
      // Never another user's envelope, whatever the row says.
      const view = envelope && envelope.userId === userId ? buildEnvelopeView(envelopeId, envelope, user) : null;
      if (view) {
        documents.push({ ...base, state: view.status === 'completed' ? 'signed' : 'ready', envelope: view });
        continue;
      }
      const dispatch = snap.get('esignDispatch') as { state?: string } | undefined;
      documents.push({ ...base, state: dispatch?.state === 'failed' ? 'failed' : 'preparing', envelope: null });
    }

    if (documents.length > 0 && documents.every((doc) => doc.state === 'signed')) {
      await closeSigningSession(auth.inviteRef);
      return NextResponse.json({ error: 'all documents signed', done: true }, { status: 409 });
    }

    const view: InviteSignView = {
      signerName: typeof user.displayName === 'string' ? user.displayName : '',
      documents,
    };
    return NextResponse.json(view, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[onboard sign] failed to load documents', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}
