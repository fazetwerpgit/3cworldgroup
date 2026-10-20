'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useDeck } from './deckState';
import {
  auroraText,
  cleanKwhDraft,
  editableKwh,
  estimateUsage,
  formatKwh,
  MONTH_LABELS,
  parseKwh,
  usageBasis,
  type UsageEntry,
  type UsageMode,
} from './usage';
import { useUsageSync } from './usageSync';
import s from './solarDeck.module.css';

// The usage helper: the rep reads the homeowner's usage off the electric bill
// (monthly kWh, a daily average, or the twelve monthly bars), the deck works
// out the annual and monthly figures and copies a block for Aurora. Kept in
// the deck session like every other answer (deckState `monthlyKwh`, `usage`),
// and sent to the saved lead as it changes (usageSync).

const MODES: { mode: UsageMode; label: string }[] = [
  { mode: 'monthly', label: 'Monthly' },
  { mode: 'daily', label: 'Daily' },
  { mode: 'months', label: '12 months' },
];

/** A kWh field that keeps what is being typed ("32.") and stores the number. */
function KwhField({
  id,
  label,
  unit,
  value,
  onChange,
  compact = false,
}: {
  id: string;
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={`${s.field} ${compact ? s.usageMonth : s.usageField}`}>
      <label htmlFor={id}>{label}</label>
      <div className={s.unitWrap}>
        <input
          id={id}
          className={s.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint={compact ? 'next' : 'done'}
          placeholder={compact ? undefined : '0'}
          value={draft ?? editableKwh(value)}
          onFocus={() => setDraft(editableKwh(value))}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            const text = cleanKwhDraft(e.target.value);
            setDraft(text);
            onChange(parseKwh(text));
          }}
        />
        {unit ? (
          <span className={s.unit} aria-hidden>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function UsageSlide() {
  const { state, update } = useDeck();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const entry = state.usage;
  const estimate = estimateUsage(entry);
  const saveStatus = useUsageSync();

  const setUsage = (patch: Partial<UsageEntry>) => {
    setCopy('idle');
    update((prev) => {
      const usage = { ...prev.usage, ...patch };
      return { usage, monthlyKwh: estimateUsage(usage)?.monthlyKwh ?? null };
    });
  };
  const setMonth = (i: number, value: number | null) =>
    setUsage({ months: entry.months.map((v, j) => (j === i ? value : v)) });

  const block = estimate ? auroraText(state.lead, entry, estimate) : '';
  const copyBlock = async () => {
    try {
      await navigator.clipboard.writeText(block);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>From the bill</p>
        <h2 className={s.title}>
          Your Electric <span className={s.accent}>Usage</span>
        </h2>
        <p className={s.lede}>Enter the usage from the bill: monthly kWh, the daily average, or all 12 months.</p>
      </div>

      <div className={s.usage}>
        <div className={s.formCard}>
          <div className={s.steps} role="group" aria-label="Usage from">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className={`${s.stepTab} ${s.modeTab}`}
                aria-pressed={entry.mode === m.mode}
                onClick={() => setUsage({ mode: m.mode })}
              >
                {m.label}
              </button>
            ))}
          </div>

          {entry.mode === 'monthly' ? (
            <KwhField
              id="solar-kwh-monthly"
              label="Monthly usage"
              unit="kWh / mo"
              value={entry.monthly}
              onChange={(v) => setUsage({ monthly: v })}
            />
          ) : entry.mode === 'daily' ? (
            <KwhField
              id="solar-kwh-daily"
              label="Daily average"
              unit="kWh / day"
              value={entry.daily}
              onChange={(v) => setUsage({ daily: v })}
            />
          ) : (
            <div className={s.usageMonths} role="group" aria-label="Monthly kWh">
              {MONTH_LABELS.map((label, i) => (
                <KwhField
                  key={label}
                  id={`solar-kwh-${label.toLowerCase()}`}
                  label={label}
                  value={entry.months[i]}
                  onChange={(v) => setMonth(i, v)}
                  compact
                />
              ))}
            </div>
          )}
          <p className={s.small}>
            {entry.mode === 'months'
              ? 'kWh per month. Blank months are filled with the average of the rest.'
              : entry.mode === 'daily'
                ? 'The bill usually lists it as average daily usage.'
                : 'The kWh used in a typical month.'}
          </p>
        </div>

        <div className={`${s.card} ${s.usageResult}`} aria-live="polite">
          <div className={s.usageStats}>
            <div>
              <span className={s.label}>Per year (est.)</span>
              <p className={s.usageNum} data-testid="solar-annual-kwh">
                {estimate ? formatKwh(estimate.annualKwh) : '-'}
                <span className={s.usageUnit}> kWh</span>
              </p>
            </div>
            <div>
              <span className={s.label}>Per month (avg.)</span>
              <p className={s.usageNum} data-testid="solar-monthly-kwh">
                {estimate ? formatKwh(estimate.monthlyKwh) : '-'}
                <span className={s.usageUnit}> kWh</span>
              </p>
            </div>
          </div>
          <p className={s.small}>{estimate ? usageBasis(entry, estimate) : 'Enter usage to see the totals.'}</p>
          {state.leadId && saveStatus !== 'idle' ? (
            <p className={s.small} data-testid="solar-usage-save" data-state={saveStatus}>
              {saveStatus === 'saving'
                ? 'Saving to the lead...'
                : saveStatus === 'saved'
                  ? 'Saved to the lead.'
                  : 'Not saved to the lead yet. It stays here and saves on the next change.'}
            </p>
          ) : null}
          <div className={s.formFoot}>
            <button type="button" className={s.primary} disabled={!estimate} onClick={() => void copyBlock()}>
              {copy === 'copied' ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
              {copy === 'copied' ? 'Copied' : 'Copy for Aurora'}
            </button>
            {copy === 'failed' ? (
              <p className={s.alert} role="alert">
                Could not copy. Select the text below and copy it.
              </p>
            ) : null}
          </div>
          {estimate ? <pre className={s.usageBlock}>{block}</pre> : null}
        </div>
      </div>
    </>
  );
}
