import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { aiConsentAt, isAiProvider } from '@/lib/ai/consent';

// The one-time AI consent (lib/ai/consent, App Store 5.1.2(i)).
// GET  -> { deepseek: boolean, gemini: boolean } for the caller.
// POST { provider: 'deepseek' | 'gemini' } -> stamps users/{uid}.aiConsent.{provider}
// once; a repeat keeps the first time. Nothing here ever clears it.

export async function GET(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  return NextResponse.json(gate.aiConsent);
}

export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const db = adminDb;

  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
  const provider = body?.provider;
  if (!isAiProvider(provider)) return NextResponse.json({ error: 'Unknown AI provider' }, { status: 400 });

  try {
    const userRef = db.collection('users').doc(gate.uid);
    const agreedAt = await db.runTransaction(async (tx) => {
      const existing = aiConsentAt((await tx.get(userRef)).data(), provider);
      if (existing) return existing;
      const now = Timestamp.now();
      tx.set(userRef, { aiConsent: { [provider]: now } }, { merge: true });
      return now.toDate();
    });
    return NextResponse.json({ success: true, provider, agreedAt: agreedAt.toISOString() });
  } catch (error) {
    console.error('[ai-consent] save failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
