/**
 * The free-text customer fields a rep types on a sale, with a length cap each.
 * Every reader (install status, chargebacks, carrier notices, the payout card)
 * calls string methods on them, so a number or an object stored here breaks
 * those views for everyone, not just the rep who sent it.
 */
export const CUSTOMER_TEXT_FIELD_MAX = {
  customerName: 200,
  customerPhone: 50,
  customerEmail: 320,
  customerAddress: 500,
  notes: 5000,
} as const;

export type CustomerTextField = keyof typeof CUSTOMER_TEXT_FIELD_MAX;

/**
 * Checks the customer text fields present on a request body. A missing field
 * (undefined) is left out of `values`; null reads as an empty string. Anything
 * that is not a string, or is longer than its cap, rejects the request.
 */
export function validateCustomerTextFields(
  body: Record<string, unknown>
): { ok: true; values: Partial<Record<CustomerTextField, string>> } | { ok: false; error: string } {
  const values: Partial<Record<CustomerTextField, string>> = {};
  for (const [field, max] of Object.entries(CUSTOMER_TEXT_FIELD_MAX) as Array<[CustomerTextField, number]>) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null) {
      values[field] = '';
      continue;
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `${field} must be text` };
    }
    if (value.length > max) {
      return { ok: false, error: `${field} must be at most ${max} characters` };
    }
    values[field] = value;
  }
  return { ok: true, values };
}
