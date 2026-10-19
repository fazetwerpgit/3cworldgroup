// The slide 4 bill field: what a rep may type and how it reads back. Pure.

/** Highest bill the field takes; the slider stops far lower (BILL_SLIDER_MAX). */
export const BILL_INPUT_MAX = 25_000;
export const BILL_SLIDER_MIN = 50;
export const BILL_SLIDER_MAX = 600;

/**
 * Cleans what is being typed: digits and one decimal point with at most two
 * places ("$1,000" -> "1000", "212.505" -> "212.50"). Kept as text so "212."
 * survives mid-typing.
 */
export function cleanBillDraft(text: string): string {
  const kept = text.replace(/[^\d.]/g, '');
  const dot = kept.indexOf('.');
  const whole = (dot === -1 ? kept : kept.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, 5);
  if (dot === -1) return whole;
  const cents = kept.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole || '0'}.${cents}`;
}

/** The bill a draft stands for, in dollars and cents, capped at BILL_INPUT_MAX. */
export function parseBill(text: string): number {
  const n = Number(cleanBillDraft(text));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(BILL_INPUT_MAX, Math.round(n * 100) / 100);
}

const shown = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** How a settled bill reads after the $ sign: "1,000", "212.50". */
export function formatBill(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const whole = Number.isInteger(value);
  return whole ? shown.format(value) : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The same bill as plain editable text: "1000", "212.50". */
export function editableBill(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Where the slider sits for a bill: clamped to its range, the bill itself untouched. */
export function sliderPosition(value: number): number {
  return Math.min(BILL_SLIDER_MAX, Math.max(BILL_SLIDER_MIN, value));
}
