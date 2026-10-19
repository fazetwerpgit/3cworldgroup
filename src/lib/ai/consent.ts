// One-time AI consent (App Store 5.1.2(i), owner decision Oct 18 2026).
//
// Before an AI feature first sends anything to its provider, the user agrees
// on a sheet that names the provider and says what is sent. The agreement is
// stamped once on users/{uid}.aiConsent.{provider} (POST /api/portal/ai-consent)
// and never cleared from there. The routes that call a provider check it on the
// server and refuse with 403 { code: 'ai_consent', provider } when it is
// missing; the client then shows the sheet.
//   - deepseek: Ask 3C (POST /api/portal/ask)
//   - gemini:   the sale screenshot scan (POST /api/portal/sales/scan)

export const AI_PROVIDERS = ['deepseek', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Which providers the user has agreed to. */
export type AiConsentState = Record<AiProvider, boolean>;

/** The refusal code the Ask and scan routes answer with when consent is missing. */
export const AI_CONSENT_CODE = 'ai_consent';

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}

/** When `provider` was agreed to, from a users/{uid} document, or null. */
export function aiConsentAt(userData: Record<string, unknown> | null | undefined, provider: AiProvider): Date | null {
  const map = userData?.aiConsent;
  if (!map || typeof map !== 'object') return null;
  const value = (map as Record<string, unknown>)[provider];
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === 'function') return stamp.toDate();
  return null;
}

/** Every provider's consent from a users/{uid} document. */
export function aiConsentOf(userData: Record<string, unknown> | null | undefined): AiConsentState {
  return { deepseek: aiConsentAt(userData, 'deepseek') !== null, gemini: aiConsentAt(userData, 'gemini') !== null };
}

/** The 403 body for a call to `provider` with no consent on file. */
export function aiConsentRefusal(provider: AiProvider) {
  return {
    error: provider === 'deepseek' ? 'Agree to use Ask 3C first.' : 'Agree to read screenshots with AI first.',
    code: AI_CONSENT_CODE,
    provider,
  } as const;
}

/** Whether a JSON reply is the consent refusal (for the client). */
export function isAiConsentRefusal(status: number, body: unknown): boolean {
  return status === 403 && !!body && typeof body === 'object' && (body as { code?: unknown }).code === AI_CONSENT_CODE;
}
