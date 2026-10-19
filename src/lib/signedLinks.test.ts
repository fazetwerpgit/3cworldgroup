import { describe, expect, it } from 'vitest';
import { ONBOARDING_FILE_LINK_TTL_MS, SIGNED_LINK_MARGIN_MS, signedLinksStale } from './signedLinks';

describe('signedLinksStale', () => {
  const at = Date.parse('2026-10-18T12:00:00Z');
  it('keeps links fresh until a margin before they expire', () => {
    expect(signedLinksStale(at, ONBOARDING_FILE_LINK_TTL_MS, at + 60_000)).toBe(false);
    expect(signedLinksStale(at, ONBOARDING_FILE_LINK_TTL_MS, at + ONBOARDING_FILE_LINK_TTL_MS - SIGNED_LINK_MARGIN_MS - 1)).toBe(false);
  });

  it('re-signs from the margin on, and links never fetched', () => {
    expect(signedLinksStale(at, ONBOARDING_FILE_LINK_TTL_MS, at + ONBOARDING_FILE_LINK_TTL_MS - SIGNED_LINK_MARGIN_MS)).toBe(true);
    expect(signedLinksStale(at, ONBOARDING_FILE_LINK_TTL_MS, at + 60 * 60_000)).toBe(true);
    expect(signedLinksStale(0, ONBOARDING_FILE_LINK_TTL_MS)).toBe(true);
  });
});
