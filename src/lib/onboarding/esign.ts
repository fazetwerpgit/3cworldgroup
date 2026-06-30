import { ONBOARDING_ITEMS } from '@/types';

// Items signed via Adobe Sign (outside the app). The rep records a free-text
// confirmation in the existing reference field; no API integration.
export const ESIGN_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'esign'
).map((i) => i.id);

export function isEsignItem(itemId: string): boolean {
  return ESIGN_ITEM_IDS.includes(itemId);
}

// Adobe Sign agreements dashboard. We do not deep-link per agreement (those
// URLs need the Adobe Sign API and would break on free-text references).
export const ADOBE_SIGN_DASHBOARD_URL = 'https://secure.adobesign.com/public/agreements';

// Single source for the rep-facing instruction on esign items.
export const ESIGN_HELPER_TEXT = "Sign this in Adobe Sign, then confirm here once it's done.";
