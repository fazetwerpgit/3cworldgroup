import { LIGHT_VETTING_ROLES, type FieldRole } from '@/types/auth';
import {
  ONBOARDING_ITEMS,
  BASE_VETTING_ROLES,
  type OnboardingStatus,
} from '@/types/onboarding';

/** Items a base-role rep must complete: non-IBO items applicable to base roles. */
export const BASE_COMPLETION_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) =>
    !i.iboOnly &&
    (i.appliesToRoles.length === 0 ||
      i.appliesToRoles.some((r) => (BASE_VETTING_ROLES as readonly string[]).includes(r)))
).map((i) => i.id);

/**
 * True when assigning `newFieldRole` should surface the "never completed base
 * onboarding" warning.
 */
export function needsPromotionWarning(
  newFieldRole: FieldRole,
  itemStatuses: Record<string, OnboardingStatus>
): boolean {
  if (!(LIGHT_VETTING_ROLES as readonly string[]).includes(newFieldRole)) return false;
  return BASE_COMPLETION_ITEM_IDS.some((id) => itemStatuses[id] !== 'approved');
}
