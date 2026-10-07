import { APPLICATION_INTERESTS, type ApplicationInterest } from '@/types';

// Helpers for the /apply "What do you want to sell?" answers, shared by the
// form, the API that stores them, the sheet and the Recruits list.

/**
 * Untrusted input (the public API body) down to known values, once each, in the
 * form's order. Anything else is dropped rather than rejected: the box is optional.
 */
export function cleanInterests(value: unknown): ApplicationInterest[] {
  if (!Array.isArray(value)) return [];
  return APPLICATION_INTERESTS.map((interest) => interest.value).filter((known) => value.includes(known));
}

/** "Fiber, Solar" for the sheet, the export and the Recruits list. */
export function interestLabels(values: readonly string[] | undefined): string {
  return APPLICATION_INTERESTS.filter((interest) => values?.includes(interest.value))
    .map((interest) => interest.label)
    .join(', ');
}
