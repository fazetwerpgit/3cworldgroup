import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { esignSentEmail } from '@/lib/email/templates';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import type { FieldRole } from '@/types/auth';
import { getEsignProvider } from './provider';
import type { EsignDocKey } from './provider';

const ESIGN_DOC_KEYS = new Set<string>(['contract', 'direct_deposit', 'pay_structure', 'fcra_auth']);

/**
 * Creates e-sign envelopes for every applicable e-sign item the user has not
 * been sent yet. Idempotent: items with an esignEnvelopeId are skipped.
 */
export async function sendPendingEsignDocs(userId: string): Promise<string[]> {
  if (!adminDb) return [];

  const userSnap = await adminDb.doc(`users/${userId}`).get();
  if (!userSnap.exists) return [];

  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!fieldRole) return [];

  const signerName = (userSnap.get('displayName') as string | undefined) ?? 'Rep';
  const signerEmail = userSnap.get('email') as string | undefined;
  if (!signerEmail) return [];

  const items = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO')).filter(
    (item) => item.referenceKind === 'esign' && ESIGN_DOC_KEYS.has(item.id)
  );
  const provider = getEsignProvider();
  const sent: string[] = [];
  const sentLabels: string[] = [];

  for (const item of items) {
    const ref = adminDb.doc(`userOnboarding/${userId}_${item.id}`);
    const snap = await ref.get();
    const status = (snap.get('status') as string | undefined) ?? 'not_started';
    if (snap.get('esignEnvelopeId')) continue;
    if (!['not_started', 'submitted', 'rejected'].includes(status)) continue;

    try {
      const { envelopeId } = await provider.createEnvelope({
        docKey: item.id as EsignDocKey,
        userId,
        itemId: item.id,
        signerName,
        signerEmail,
      });
      const now = new Date();
      await ref.set(
        {
          userId,
          itemId: item.id,
          status: 'submitted',
          reference: `esign:${envelopeId}`,
          esignEnvelopeId: envelopeId,
          submittedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      sent.push(item.id);
      sentLabels.push(item.label);
    } catch (error) {
      console.error(`[esign] envelope creation failed for ${userId}/${item.id}`, error);
    }
  }

  if (sent.length > 0) {
    await dispatchToUser({
      userId,
      type: 'system',
      title: 'Documents sent for signature',
      message: `Check your email: ${sentLabels.join(', ')}`,
      link: '/portal/onboarding',
      email: esignSentEmail({ name: signerName, docLabels: sentLabels }),
    });
  }

  return sent;
}
