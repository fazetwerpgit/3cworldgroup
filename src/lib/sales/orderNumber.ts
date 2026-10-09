// One order number, however it was typed. A rep backfilling sales re-picked the
// same screenshot and logged one T-Fiber order three times; each submit had its
// own idempotency key, so only the order number could tell they were one sale.
// "ord-1001", " ORD 1001 " and "ORD1001" are the same order.

/** Trim, uppercase, and drop spaces and dashes. '' when there is no order number. */
export function normalizeOrderNumber(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Raw spellings worth an equality query on `orderNumberOrBtn`, for sales
 * written before `orderNumberKey` existed. Older docs only match the exact
 * string they stored, so this covers the common ways the same number is typed.
 */
export function orderNumberRawVariants(value: unknown): string[] {
  if (typeof value !== 'string' && typeof value !== 'number') return [];
  const raw = String(value);
  const trimmed = raw.trim();
  const key = normalizeOrderNumber(raw);
  if (!key) return [];
  return [...new Set([raw, trimmed, trimmed.toUpperCase(), trimmed.toLowerCase(), key])].filter(Boolean);
}

/** "Wil Teasdale" -> "Wil T."; a single name stays as is; '' -> ''. */
export function firstNameLastInitial(name: unknown): string {
  const parts = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Maria Lopez" -> "Maria"; '' when there is no name. */
export function firstName(name: unknown): string {
  return typeof name === 'string' ? name.trim().split(/\s+/)[0] ?? '' : '';
}

/**
 * What the Log Sale form is told when the order number is already on a live
 * sale. `existingSaleId` is null unless the caller may open that sale (their
 * own, or an admin/owner): another rep's sale is named, never linked.
 */
export interface OrderDuplicate {
  existingSaleId: string | null;
  existingRepName: string;
  /** ISO timestamp of the existing sale's date, or null when it has none. */
  existingSaleDate: string | null;
  existingCustomerFirstName: string | null;
  /** The existing sale is the caller's own. */
  existingIsMine: boolean;
}
