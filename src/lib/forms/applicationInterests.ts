// What an applicant on /apply says they want to sell (owner request, 2026-10).
// Shared by the form, the API that stores it, and the Applicants tab.

export const APPLICATION_INTERESTS = [
  { value: 'fiber', label: 'Fiber' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'tv', label: 'TV' },
  { value: 'security', label: 'Security' },
  { value: 'solar', label: 'Solar' },
  { value: 'business', label: 'Business services' },
] as const;

export type ApplicationInterest = (typeof APPLICATION_INTERESTS)[number]['value'];

/**
 * Untrusted input (the public API body) down to known values, once each, in the
 * form's order. Anything else is dropped rather than rejected: the box is optional.
 */
export function cleanInterests(value: unknown): ApplicationInterest[] {
  if (!Array.isArray(value)) return [];
  return APPLICATION_INTERESTS.map((interest) => interest.value).filter((known) => value.includes(known));
}

/** "Fiber, Solar" for the sheet, the export and the Applicants list. */
export function interestLabels(values: readonly string[] | undefined): string {
  return APPLICATION_INTERESTS.filter((interest) => values?.includes(interest.value))
    .map((interest) => interest.label)
    .join(', ');
}
