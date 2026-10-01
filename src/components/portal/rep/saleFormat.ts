// Number and date formatting for the sale detail and edit pages. Stored sale
// rows can be malformed (a product with no unitPrice or points), so every
// figure goes through num() first: a bad value reads as 0, never "$NaN" and
// never a throw.

/** A stored number, or 0 when it is missing or not finite. */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** "$1,240": whole dollars, the same rounding the Sales list uses for pay and value. */
export function formatMoney(value: unknown): string {
  return `$${Math.round(num(value)).toLocaleString('en-US')}`;
}

/** A plan price: "$60" or "$44.99" (cents only when there are some). */
export function formatPrice(value: unknown): string {
  const n = num(value);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Sep 22, 2026", or null when there is no readable date. */
export function formatDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
