import { FieldRole } from './auth';

export interface CommissionConfig {
  fieldRole: FieldRole;
  baseRate: number;
  overrideRate?: number;
  notes?: string;
}

// TODO: confirm real rates
export const DEFAULT_COMMISSION: CommissionConfig[] = [
  { fieldRole: 'entry_rep', baseRate: 0 },
  { fieldRole: 'l1_manager', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'l2_manager', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'ibo_level_1', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'ibo_level_2', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'ibo_level_3', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'ibo_level_4', baseRate: 0, overrideRate: 0 },
];

// Firestore doc shape (config/commission). Rates are editable config -
// admins adjust them without a deploy once the real numbers are confirmed.
export interface CommissionSettings {
  tiers: CommissionConfig[];
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
}

// True until real rates replace the zero placeholders
export function ratesArePending(tiers: CommissionConfig[]): boolean {
  return tiers.every((t) => t.baseRate === 0 && (t.overrideRate ?? 0) === 0);
}
