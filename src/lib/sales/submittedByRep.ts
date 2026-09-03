import type { Sale } from '@/types/sales';

// Pairing the raw submissions with the carrier's account of the same rep.
//
// Install status groups the carrier's orders by rep. These helpers put each
// rep's own portal submissions in the same group, so "the carrier says this
// install happened and nobody logged it" can be checked against "here is
// everything that rep did log" without leaving the section.

/** Newest first, by sale date, with undated rows last. A submission with no date still has to appear. */
function bySaleDateDesc(a: Sale, b: Sale) {
  const at = a.saleDate ? new Date(a.saleDate as Date | string).getTime() : NaN;
  const bt = b.saleDate ? new Date(b.saleDate as Date | string).getTime() : NaN;
  const aOk = Number.isFinite(at);
  const bOk = Number.isFinite(bt);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return bt - at;
}

/**
 * Submissions keyed by the rep who logged them (`salesRepId`), newest first.
 *
 * Keyed on the id and never on the name: the carrier spells a rep's name its
 * own way ("Noah St John" vs "Noah st john"), and a name collision would file
 * one rep's sales under another.
 */
export function submittedByRep(sales: Sale[]): Map<string, Sale[]> {
  const groups = new Map<string, Sale[]>();
  for (const sale of sales) {
    const repId = sale.salesRepId;
    if (!repId) continue; // Nothing to attach it to; the merged board still shows it.
    const existing = groups.get(repId);
    if (existing) existing.push(sale);
    else groups.set(repId, [sale]);
  }
  for (const list of groups.values()) list.sort(bySaleDateDesc);
  return groups;
}

/** Does this submission match a typed search? Address and customer name only — what a person types is a street. */
export function submissionMatches(sale: Sale, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${sale.customerAddress ?? ''} ${sale.customerName ?? ''}`.toLowerCase();
  return haystack.includes(needle);
}
