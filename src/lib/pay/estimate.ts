// One rounding rule for every estimated pay figure (owner, 2026-10-18).
//
// Sum the exact amounts first (rates such as 67.5 and 97.5 keep their cents
// through every total), then round ONCE, where the figure is shown, and round
// DOWN: an estimate must never overstate pay. Rounding each sale to the
// nearest dollar first read $0.50 high per half-dollar sale (2 x 67.5 showed
// $136), and the rep's figures disagreed with the owner's commissions ($135).
//
// The rep dashboard, the Pay list, the payout window, the widget and the
// owner's commissions all show pay through here.

// Float sums of cents can land a hair under a whole dollar (0.1 + 0.2): a
// figure within this much of the next dollar up is that dollar.
const FLOAT_SLACK = 1e-6;

/** Whole dollars for an estimate: rounded down, once. -320.4 is -321 (never overstated). */
export function estimateDollars(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const whole = Math.floor(value + FLOAT_SLACK);
  return whole === 0 ? 0 : whole; // no "-0"
}

/** "$1,234", or "−$321" below zero: estimateDollars, formatted. */
export function formatEstimate(value: number): string {
  const whole = estimateDollars(value);
  return `${whole < 0 ? '−' : ''}$${Math.abs(whole).toLocaleString('en-US')}`;
}
