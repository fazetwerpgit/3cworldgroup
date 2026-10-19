import { describe, expect, it } from 'vitest';
import { aiConsentAt, aiConsentOf, aiConsentRefusal, isAiConsentRefusal, isAiProvider } from './consent';

describe('AI consent', () => {
  it('reads each provider from users/{uid}.aiConsent (a Timestamp or a Date)', () => {
    const at = new Date('2026-10-18T12:00:00Z');
    const user = { aiConsent: { deepseek: { toDate: () => at }, gemini: null } };
    expect(aiConsentAt(user, 'deepseek')).toEqual(at);
    expect(aiConsentOf(user)).toEqual({ deepseek: true, gemini: false, gemini_voice: false });
    expect(aiConsentOf({ aiConsent: { gemini: at } })).toEqual({ deepseek: false, gemini: true, gemini_voice: false });
    expect(aiConsentOf({})).toEqual({ deepseek: false, gemini: false, gemini_voice: false });
    expect(aiConsentOf(undefined)).toEqual({ deepseek: false, gemini: false, gemini_voice: false });
    expect(aiConsentOf({ aiConsent: { deepseek: true, gemini: 'yes' } })).toEqual({ deepseek: false, gemini: false, gemini_voice: false });
    expect(aiConsentOf({ aiConsent: { gemini_voice: at } })).toEqual({ deepseek: false, gemini: false, gemini_voice: true });
  });

  it('knows its providers and its refusal', () => {
    expect(isAiProvider('deepseek')).toBe(true);
    expect(isAiProvider('gemini_voice')).toBe(true);
    expect(isAiProvider('openai')).toBe(false);
    expect(aiConsentRefusal('gemini_voice')).toMatchObject({ error: 'Agree to use Practice voice first.', provider: 'gemini_voice' });
    expect(isAiConsentRefusal(403, aiConsentRefusal('gemini'))).toBe(true);
    expect(isAiConsentRefusal(403, { error: 'Account is not active' })).toBe(false);
    expect(isAiConsentRefusal(400, aiConsentRefusal('gemini'))).toBe(false);
  });
});
