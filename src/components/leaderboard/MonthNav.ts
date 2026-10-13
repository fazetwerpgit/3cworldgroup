import type { MonthKey } from '@/lib/sales/monthWindow';

/** The month board's ‹ Month › stepper state, from the route to both boards. */
export interface MonthNav {
  month: MonthKey;
  min: MonthKey;
  max: MonthKey;
  onChange: (next: MonthKey) => void;
}
