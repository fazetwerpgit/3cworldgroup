// Shared shapes for the Log Sale screenshot reader (POST /api/portal/sales/scan).
// The server reads the proof screenshots and answers in the form's own terms:
// field names are the Log Sale form's, `provider` is a catalog company key and
// `plan` a catalog product id, both matched in code, never taken from the model.

export type ScanConfidence = 'high' | 'medium' | 'low';

export type ScanValue = { value: string; confidence: ScanConfidence };

export const SCAN_FIELD_KEYS = [
  'orderNumberOrBtn',
  'customerName',
  'customerPhone',
  'customerAddress',
  'installDate',
  'provider',
  'plan',
  'installWindow',
] as const;

export type ScanFieldKey = (typeof SCAN_FIELD_KEYS)[number];

/** Only the fields the reader found; an absent key means "not on the screenshot". */
export type SaleScanFields = Partial<Record<ScanFieldKey, ScanValue>>;

export type SaleScanResponse = { fields: SaleScanFields | null; reason?: string };

const RANK: Record<ScanConfidence, number> = { low: 0, medium: 1, high: 2 };

/** The weaker of two confidences (a plan is only as sure as its carrier). */
export function weakerConfidence(a: ScanConfidence, b: ScanConfidence): ScanConfidence {
  return RANK[a] <= RANK[b] ? a : b;
}
