'use client';

import { getIdToken } from '@/lib/firebase/getIdToken';
import type { AiConsentState, AiProvider } from './consent';

// Client side of the one-time AI consent (lib/ai/consent).

/** The caller's consent per provider, or null when it could not be read (the routes still enforce it). */
export async function fetchAiConsent(): Promise<AiConsentState | null> {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ai-consent', { headers: { Authorization: `Bearer ${token ?? ''}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<AiConsentState>;
    return { deepseek: json.deepseek === true, gemini: json.gemini === true, gemini_voice: json.gemini_voice === true };
  } catch {
    return null;
  }
}

/** Records "Agree" for `provider`. True once it is saved. */
export async function agreeToAi(provider: AiProvider): Promise<boolean> {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ai-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ provider }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
