import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { isEsignItem } from '@/lib/onboarding/esign';
import { getEsignProvider } from '@/lib/esign/provider';

export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { itemId } = (await request.json().catch(() => ({}))) as { itemId?: string };
  if (!itemId || !isEsignItem(itemId)) {
    return NextResponse.json({ error: 'unknown item' }, { status: 400 });
  }

  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const onboardingDoc = await adminDb.doc(`userOnboarding/${gate.uid}_${itemId}`).get();
  const envelopeId = onboardingDoc.data()?.esignEnvelopeId;
  if (!onboardingDoc.exists || typeof envelopeId !== 'string' || !envelopeId) {
    return NextResponse.json({ error: 'no envelope' }, { status: 404 });
  }

  let url: string | undefined;
  try {
    url = await getEsignProvider().getEmbeddedSigningUrl(envelopeId);
  } catch (error) {
    console.error(`[esign] signing url refresh failed for ${gate.uid}/${itemId}`, error);
    return NextResponse.json({ error: 'refresh failed' }, { status: 502 });
  }

  if (!url) {
    console.error(`[esign] signing url refresh failed for ${gate.uid}/${itemId}`, 'provider returned no URL');
    return NextResponse.json({ error: 'refresh failed' }, { status: 502 });
  }

  try {
    await adminDb.doc(`esignSigningUrls/${gate.uid}_${itemId}`).set(
      {
        userId: gate.uid,
        itemId,
        envelopeId,
        url,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error(`[esign] signing url refresh persistence failed for ${gate.uid}/${itemId}`, error);
  }

  return NextResponse.json({ url });
}
