// Sending a bulk batch: one sale at a time through the same create-sale call as
// the Log Sale form (useSales().createSale), each under its own row id as the
// clientSaleId. A retry of a row, or a second tap after the app was closed
// mid-send, reuses that id, so the server hands back the sale it already wrote
// instead of logging it twice. Nothing here is ever sent without a tap.

import type { CreateSaleData } from '@/types';
import type { CreateSaleResult } from '@/hooks/useSales';
import { buildSalePayload, type SaleSubmitter } from '@/lib/sales/saleForm';
import type { BulkResult, BulkRow } from './batch';

export type CreateSaleFn = (
  data: CreateSaleData,
  options: { onError: (message: string) => void }
) => Promise<CreateSaleResult | null>;

/** The create-sale answer as a row result. */
export function toBulkResult(created: CreateSaleResult | null, errorMessage: string): BulkResult {
  if (!created) {
    const reason = /^no signal/i.test(errorMessage)
      ? 'No signal. Tap Log again to retry.'
      : errorMessage || 'Something went wrong. Try again.';
    return { kind: 'failed', reason };
  }
  if (created.orderDuplicate) return { kind: 'already', duplicate: created.orderDuplicate };
  // A `duplicate` is this row's own key coming back: its sale is stored.
  return { kind: 'logged', saleId: created.sale.id ?? null };
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
          proofPaths: row.proofPath ? [row.proofPath] : [],
          user,
          clientSaleId: row.id,
          allowDuplicate,
        }),
        { onError: (m) => (message = m) }
      );
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    onResult(row.id, toBulkResult(created, message));
  }
}
