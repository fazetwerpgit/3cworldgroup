// Sending a bulk batch: one sale at a time through the same create-sale call as
// the Log Sale form (useSales().createSale), each under its own row id as the
// clientSaleId. A retry of a row, or a second tap after the app was closed
// mid-send, reuses that id, so the server hands back the sale it already wrote
// instead of logging it twice. Nothing here is ever sent without a tap.

import type { CreateSaleData } from '@/types';
import type { CreateSaleResult } from '@/hooks/useSales';
import { normalizeOrderNumber } from '@/lib/sales/orderNumber';
import { buildSalePayload, isSameSaleEntry, type SaleSubmitter } from '@/lib/sales/saleForm';
import { rowProofPaths, type BulkResult, type BulkRow } from './batch';

export type CreateSaleFn = (
  data: CreateSaleData,
  options: { onError: (message: string) => void }
) => Promise<CreateSaleResult | null>;

/**
 * True when the sale the server handed back is the row as it is now. A replay
 * of an earlier send that landed unseen holds what was sent then; if the rep
 * edited the row since, the edit is not on the stored sale.
 */
export function replayMatchesRow(
  sale: Partial<Record<string, unknown>> | null | undefined,
  row: Pick<BulkRow, 'formData' | 'products'>
): boolean {
  if (!sale) return false;
  return (
    isSameSaleEntry(sale as Parameters<typeof isSameSaleEntry>[0], row) &&
    normalizeOrderNumber(sale.orderNumberOrBtn) === normalizeOrderNumber(row.formData.orderNumberOrBtn)
  );
}

/** The create-sale answer as a row result. */
export function toBulkResult(
  created: CreateSaleResult | null,
  errorMessage: string,
  row?: Pick<BulkRow, 'formData' | 'products'>
): BulkResult {
  if (!created) {
    const reason = /^no signal/i.test(errorMessage)
      ? 'No signal. Tap Log again to retry.'
      : errorMessage || 'Something went wrong. Try again.';
    return { kind: 'failed', reason };
  }
  if (created.orderDuplicate) return { kind: 'already', duplicate: created.orderDuplicate };
  // A `duplicate` is this row's own key coming back: its sale is stored, but
  // it may be what an earlier send carried, from before the rep's edit.
  const saleId = created.sale.id ?? null;
  if (created.duplicate && row && !replayMatchesRow(created.sale as unknown as Record<string, unknown>, row)) {
    return { kind: 'logged', saleId, editLost: true };
  }
  return { kind: 'logged', saleId };
}

/**
 * Send `rows` one after another. `onStart` and `onResult` report each row;
 * `shouldStop` is checked before each send (the page went away). With
 * `allowDuplicate` the order-number check is skipped ("Log anyway").
 */
export async function submitBulkRows({
  rows,
  user,
  create,
  allowDuplicate = false,
  onStart,
  onResult,
  shouldStop = () => false,
}: {
  rows: BulkRow[];
  user: SaleSubmitter;
  create: CreateSaleFn;
  allowDuplicate?: boolean;
  onStart: (id: string) => void;
  onResult: (id: string, result: BulkResult) => void;
  shouldStop?: () => boolean;
}): Promise<void> {
  for (const row of rows) {
    if (shouldStop()) return;
    onStart(row.id);
    let message = '';
    let created: CreateSaleResult | null = null;
    try {
      created = await create(
        buildSalePayload({
          formData: row.formData,
          products: row.products,
          proofPaths: rowProofPaths(row),
          user,
          clientSaleId: row.id,
          allowDuplicate,
        }),
        { onError: (m) => (message = m) }
      );
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    onResult(row.id, toBulkResult(created, message, row));
  }
}
