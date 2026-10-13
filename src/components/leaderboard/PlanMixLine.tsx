'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { formatPlanMix, planMixForms, type PlanMixEntry } from '@/lib/sales/planMix';
import styles from './leaderboard.module.css';

/** The plan mix under a name, on one line that always fits its slot.
 *
 *  A strong week holds more than the slot is wide, and an ellipsis there hides
 *  most of the line. So the line takes the longest of its forms that fits the
 *  width it has: "13× 1 Gig · 4× 2 Gig · 3× 300", then "13×1G · 4×2G · 3×300",
 *  then "13×1G · 4×2G +3", then "13×1G +7". Which form fits depends on the
 *  counts as much as on the width, so the forms are measured (a hidden copy of
 *  each) rather than guessed from a CSS breakpoint. Screen readers always get
 *  the full line. Counts only, nothing when empty. */
export function PlanMixLine({ mix, className }: { mix?: PlanMixEntry[] | null; className?: string }) {
  const forms = planMixForms(mix);
  const key = forms.join('|');
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ key: string; index: number }>({ key, index: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const pick = () => {
      const width = box.clientWidth;
      if (width <= 0) return; // not laid out (hidden, or no layout engine): keep the full line
      const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
      const first = widths.findIndex((formWidth) => formWidth <= width + 0.5);
      const index = first === -1 ? widths.length - 1 : first;
      setFit((current) => (current.key === key && current.index === index ? current : { key, index }));
    };
    pick();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(pick);
    observer.observe(box);
    let live = true;
    // The face can land after the first pass, and that changes every width.
    void document.fonts?.ready.then(() => {
      if (live) pick();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [key]);

  if (forms.length === 0) return null;
  const index = fit.key === key ? Math.min(fit.index, forms.length - 1) : 0;

  return (
    <span ref={boxRef} className={`${styles.mix} ${className ?? ''}`} data-testid="plan-mix" data-form={index}>
      <span className={styles.srOnly}>Plan mix: {formatPlanMix(mix)}</span>
      <span className={styles.mixText} aria-hidden="true">
        {forms[index]}
      </span>
      <span ref={measureRef} className={styles.mixMeasure} aria-hidden="true">
        {forms.map((form) => (
          <span key={form}>{form}</span>
        ))}
      </span>
    </span>
  );
}
