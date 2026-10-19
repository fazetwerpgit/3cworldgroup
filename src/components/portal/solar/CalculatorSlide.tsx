'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Pencil, Plus } from 'lucide-react';
import { futureValue } from '@/lib/solar/calc';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useDeck } from './deckState';
import { formatWholeDollars } from './solarClient';
import {
  BILL_INPUT_MAX,
  BILL_SLIDER_MAX,
  BILL_SLIDER_MIN,
  cleanBillDraft,
  editableBill,
  formatBill,
  parseBill,
  sliderPosition,
} from './billInput';
import s from './solarDeck.module.css';

// Slide 4: what the monthly power bill would grow to if it were saved instead
// (futureValue: monthly deposit at the start of each month, 5% APY, 25 years).

/** Tweens to `target` over ~700 ms; jumps straight there for reduced motion. */
function useTween(target: number, reduced: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced) {
      from.current = target;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = begin + (target - begin) * eased;
      from.current = value;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return reduced ? target : shown;
}

/** One-tap bills for the usual range, and the step of the - / + buttons. */
const CHIPS = [100, 150, 200, 250, 300, 400];
const STEP = 10;

export function CalculatorSlide() {
  const { state, update } = useDeck();
  const reduced = usePrefersReducedMotion();
  // What is being typed; null shows the stored bill, formatted (after the slider moves, or on blur).
  const [draft, setDraft] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const billRef = useRef<HTMLInputElement>(null);

  const result = futureValue(state.monthlyBill, state.apy, state.years);
  const total = useTween(result.total, reduced);
  const principalPct = result.total > 0 ? (result.principal / result.total) * 100 : 100;
  const months = Math.round(state.years * 12);

  // Typed amounts keep their cents and may run past the slider's top; the
  // slider just parks at its end.
  const setBill = (text: string) => {
    const clean = cleanBillDraft(text);
    setDraft(clean);
    update({ monthlyBill: parseBill(clean) });
  };

  const nudge = (by: number) => {
    setDraft(null);
    update({ monthlyBill: Math.min(BILL_INPUT_MAX, Math.max(0, Math.round((state.monthlyBill + by) / STEP) * STEP)) });
  };
  const rate = `${(state.apy * 100).toFixed(2)}% APY`;

  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Savings calculator</p>
        <h2 className={s.title}>
          How much do you <span className={s.accent}>currently spend?</span>
        </h2>
        <p className={s.lede}>
          What if that bill went into savings at {rate} instead, every month for {state.years} years?
        </p>
      </div>
      <div className={s.calc}>
        <div className={s.card}>
          <label className={s.label} htmlFor="solar-bill">
            Monthly electric bill
          </label>
          <div className={s.billRow}>
            <button type="button" className={s.stepBtn} onClick={() => nudge(-STEP)} aria-label={`Lower the bill by $${STEP}`}>
              <Minus size={20} aria-hidden />
            </button>
            {/* The whole field takes the tap, the $, pencil and "/ month" included. */}
            <div className={s.billInput} onClick={() => billRef.current?.focus()}>
              <span className={s.billDollar} aria-hidden>
                $
              </span>
              <input
                ref={billRef}
                id="solar-bill"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="0"
                value={draft ?? formatBill(state.monthlyBill)}
                onFocus={(e) => {
                  const input = e.currentTarget;
                  setDraft(editableBill(state.monthlyBill));
                  // After React swaps in the plain digits, select them so typing replaces the amount.
                  requestAnimationFrame(() => input.select());
                }}
                onBlur={() => setDraft(null)}
                onChange={(e) => setBill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                aria-describedby="solar-bill-hint solar-bill-note"
              />
              <span className={s.perMonth} aria-hidden>
                / month
              </span>
              <Pencil size={18} className={s.pencil} aria-hidden />
            </div>
            <button type="button" className={s.stepBtn} onClick={() => nudge(STEP)} aria-label={`Raise the bill by $${STEP}`}>
              <Plus size={20} aria-hidden />
            </button>
          </div>
          <p className={s.hint} id="solar-bill-hint">
            Tap the amount to enter their bill
          </p>
          <input
            className={s.range}
            type="range"
            min={BILL_SLIDER_MIN}
            max={BILL_SLIDER_MAX}
            step={5}
            value={sliderPosition(state.monthlyBill)}
            onChange={(e) => {
              setDraft(null);
              update({ monthlyBill: Number(e.target.value) });
            }}
            aria-label="Monthly bill"
          />
          <div className={s.chips} role="group" aria-label="Common bills">
            {CHIPS.map((v) => (
              <button
                key={v}
                type="button"
                className={s.quick}
                aria-pressed={state.monthlyBill === v}
                onClick={() => {
                  setDraft(null);
                  update({ monthlyBill: v });
                }}
              >
                ${v}
              </button>
            ))}
          </div>
          <div className={s.adjustRow}>
            <button
              type="button"
              className={s.adjustBtn}
              aria-expanded={adjusting}
              onClick={() => setAdjusting((v) => !v)}
            >
              {adjusting ? 'Done' : 'Adjust rate'}
            </button>
            <span className={s.small} id="solar-bill-note">
              @ {rate} · {state.years} Years ({months} mos)
            </span>
          </div>
          {adjusting ? (
            <div className={s.adjustFields}>
              <label>
                Rate (%)
                <input
                  inputMode="decimal"
                  type="number"
                  min={0}
                  max={20}
                  step={0.25}
                  value={Math.round(state.apy * 10000) / 100}
                  onChange={(e) => update({ apy: Math.min(20, Math.max(0, Number(e.target.value) || 0)) / 100 })}
                />
              </label>
              <label>
                Years
                <input
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={state.years}
                  onChange={(e) => update({ years: Math.min(40, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className={s.card}>
          <span className={s.label}>Maturity value</span>
          <p className={s.total} aria-live="polite" data-testid="solar-total">
            {formatWholeDollars(total)}
          </p>
          <p className={s.totalNote}>
            Monthly deposit ${formatBill(state.monthlyBill)} <span aria-hidden>·</span> @ {rate}
          </p>
          {/* Interest is the track; principal grows over it from the left (scaleX, not width). */}
          <div className={s.split} aria-hidden>
            <div className={s.splitPrincipal} style={{ transform: `scaleX(${principalPct / 100})` }} />
          </div>
          <dl className={s.stats}>
            <div>
              <dt>
                <i className={s.dot} style={{ background: 'var(--ink-3)' }} />
                Total principal
              </dt>
              <dd>{formatWholeDollars(result.principal)}</dd>
            </div>
            <div>
              <dt>
                <i className={s.dot} style={{ background: 'var(--money)' }} />
                Interest earned
              </dt>
              <dd className={s.money}>{formatWholeDollars(result.interest)}</dd>
            </div>
            <div>
              <dt>Time horizon</dt>
              <dd>
                {state.years} years <span className={s.small}>({months} mos)</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}
