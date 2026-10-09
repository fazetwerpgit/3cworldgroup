// What the Log Sale screenshot reader's answer puts where, pure so the fill
// rule is shared (the Log Sale form, the bulk uploader) and testable alone.

import type { SaleScanFields, ScanConfidence, ScanValue } from '@/lib/sales/scan/types';

/** Form fields the reader can fill. `plan` covers the provider and plan picker. */
export type ScanTarget = 'orderNumberOrBtn' | 'customerName' | 'customerPhone' | 'customerAddress' | 'installDate' | 'plan' | 'notes';

/** Fields that show a skeleton while the screenshot is read. */
export const SCAN_SKELETON_TARGETS: ScanTarget[] = [
  'plan',
  'orderNumberOrBtn',
  'customerName',
  'customerPhone',
  'customerAddress',
  'installDate',
];

/** The first read only runs on a blank form: these are all still empty. */
export const KEY_TARGETS: ScanTarget[] = ['plan', 'orderNumberOrBtn', 'customerAddress', 'installDate'];

export type ScanFill =
  | { target: Exclude<ScanTarget, 'plan'>; value: string; confidence: ScanConfidence }
  | { target: 'plan'; provider: string; planId: string | null };

export type ScanFlag = Exclude<ScanConfidence, 'high'>;
type Flag = ScanFlag;

export const SURENESS: Record<ScanConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Text fields a surer later read may correct (plan and notes stay fill-once). */
export const CORRECTABLE = ['orderNumberOrBtn', 'customerName', 'customerPhone', 'customerAddress', 'installDate'] as const;
export type Correctable = (typeof CORRECTABLE)[number];
export const isCorrectable = (target: ScanTarget): target is Correctable =>
  (CORRECTABLE as readonly ScanTarget[]).includes(target);

/** Can `read` go into `target`: it is open, or it beats what an earlier read put there. */
export type CanFill = (target: ScanTarget, confidence: ScanConfidence) => boolean;

/**
 * What to put where, given the reader's answer and which fields may take it.
 * Pure, so the fill rule is testable alone.
 */
export function planScanFills(
  fields: SaleScanFields,
  canFill: CanFill
): { fills: ScanFill[]; flags: Partial<Record<ScanTarget, Flag>> } {
  const fills: ScanFill[] = [];
  const flags: Partial<Record<ScanTarget, Flag>> = {};
  const flag = (target: ScanTarget, read: ScanValue) => {
    if (read.confidence !== 'high') flags[target] = read.confidence;
  };

  for (const target of CORRECTABLE) {
    const read = fields[target];
    if (!read?.value || !canFill(target, read.confidence)) continue;
    fills.push({ target, value: read.value, confidence: read.confidence });
    flag(target, read);
  }

  if (fields.provider && canFill('plan', fields.provider.confidence)) {
    const planId = fields.plan?.value ?? null;
    fills.push({ target: 'plan', provider: fields.provider.value, planId });
    // A provider with no plan is flagged too: the rep still has to pick one.
    flag('plan', fields.plan ?? { value: '', confidence: 'medium' });
  }

  if (fields.installWindow?.value && canFill('notes', fields.installWindow.confidence)) {
    fills.push({
      target: 'notes',
      value: `Install window: ${fields.installWindow.value}`,
      confidence: fields.installWindow.confidence,
    });
  }

  return { fills, flags };
}
