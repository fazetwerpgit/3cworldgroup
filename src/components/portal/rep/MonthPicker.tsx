'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { compareMonths, monthLabel, shiftMonth, type MonthKey } from '@/lib/sales/monthWindow';
import x from './rep-sales.module.css';

/** ‹ Month › stepper, shared by the Sales page and the leaderboard's month
 *  board. `max` is the latest month it can step to; `min`, when given, the
 *  earliest. */
export function MonthPicker({
  month,
  max,
  min,
  onChange,
}: {
  month: MonthKey;
  max: MonthKey;
  min?: MonthKey;
  onChange: (next: MonthKey) => void;
}) {
  return (
    <div className={x.month} role="group" aria-label="Month">
      <button
        type="button"
        className={x.monthBtn}
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={min ? compareMonths(month, min) <= 0 : false}
        aria-label="Previous month"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span className={x.monthLabel} aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className={x.monthBtn}
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={compareMonths(month, max) >= 0}
        aria-label="Next month"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
