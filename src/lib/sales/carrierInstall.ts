import type { FiberOrder, Sale } from '@/types';

// Jacob, 2026-09-14: when the carrier's activation date differs from the
// install date on the sale, the carrier wins.
//
// The date a rep types is a plan. The carrier's activation date is what
// happened — and it is the only one of the two that moves when an install
// breaks at the door and is rescheduled. Cooper's Rosaria sale carried an
// Aug 7 install that broke; the carrier activated her Sep 12, the sale never
// followed, and the pay list filed the money under August. Reps cannot edit a
// sale, so he logged her again just to have a record with the right date.
//
// This is applied at the data boundary, once, so every consumer of
// `installDate` — pay list, pipeline buckets, expected pay, the row itself —
// sees the same date without each learning the rule.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Carrier dates are bare yyyy-mm-dd; read them at local noon like sale dates are stored. */
function carrierDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parts = DATE_ONLY.exec(value.trim());
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0);
}

/** The day the carrier says it went live, or null when it has not. */
export function carrierInstallDate(order: FiberOrder | null | undefined): Date | null {
  if (!order || order.status !== 'active') return null;
  return carrierDate(order.activationDate);
}

/**
 * The sales as the rest of the page should see them: each one matched to an
 * active carrier order carries the carrier's activation date as its install
 * date. Sales with no match, or whose order has not activated, are returned as
 * they are (the same object, so identity-keyed sets still work).
 */
export function applyCarrierInstallDates<T extends Pick<Sale, 'id' | 'installDate'>>(
  sales: T[],
  fiberBySale: Map<string, FiberOrder>
): T[] {
  return sales.map((sale) => {
    const activated = carrierInstallDate(fiberBySale.get(sale.id || ''));
    if (!activated) return sale;
    const current = sale.installDate ? new Date(sale.installDate as Date | string) : null;
    if (current && current.getTime() === activated.getTime()) return sale;
    return { ...sale, installDate: activated };
  });
}
