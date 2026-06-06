import { FieldRole } from './auth';

export interface CommissionConfig {
  fieldRole: FieldRole;
  baseRate: number;
  overrideRate?: number;
}

// TODO: confirm real rates
export const DEFAULT_COMMISSION: CommissionConfig[] = [
  { fieldRole: 'entry_rep', baseRate: 0 },
  { fieldRole: 'l1_manager', baseRate: 0, overrideRate: 0 },
  { fieldRole: 'l2_manager', baseRate: 0, overrideRate: 0 },
];
