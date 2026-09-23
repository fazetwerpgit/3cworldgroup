'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Sale } from '@/types';
import { dateToSaleDateInput, installDayKey, parseInstallDateInput } from '@/lib/sales/saleDate';
import { saveInstallDate } from '@/lib/sales/saveInstallDate';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import l from './rep-logsale.module.css';
import x from './install-date-sheet.module.css';

type SheetSale = Pick<Sale, 'id' | 'customerName' | 'installDate' | 'saleDate'>;

/** A Date/ISO/Timestamp as the date input's YYYY-MM-DD, or '' when unreadable. */
function inputDay(value: unknown): string {
  return installDayKey(value) ?? '';
}

function maxInstallDay(): string {
  const max = new Date();
  max.setDate(max.getDate() + 365);
  return dateToSaleDateInput(max);
}

/**
 * The rep sets or moves the install date on one of their own sales: bottom
 * sheet on phone, centred dialog on desktop, portaled to <body>. A missed
 * install starts empty and needs a day after the one that broke, so the
 * reschedule is what puts the money back on the board.
 */
export function InstallDateSheet({
  sale,
  plan,
  missed,
  onClose,
  onSaved,
}: {
  sale: SheetSale;
  plan?: string;
  missed: boolean;
  onClose: () => void;
  onSaved: (saleId: string, installDate: string) => void;
}) {
  const current = inputDay(sale.installDate);
  const [day, setDay] = useState(missed ? '' : current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = missed ? 'Reschedule the install' : current ? 'Change install date' : 'Add install date';
  const soldDay = inputDay(sale.saleDate);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!day) {
      setError('Pick the install day.');
      return;
    }
    const parsed = parseInstallDateInput(day);
    if (!parsed.ok) {
      setError(`${parsed.error}.`);
      return;
    }
    if (soldDay && day < soldDay) {
      setError('Install date is before the sale date.');
      return;
    }
    if (missed && current && day <= current) {
      setError('Pick a day after the missed one.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const result = await saveInstallDate(sale.id || '', day);
    savingRef.current = false;
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(sale.id || '', result.installDate);
    onClose();
  };

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingRef.current) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="install-date-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="install-date-title" className={s.sheetTitle}>
              {title}
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <form className={`${s.sheetBody} ${x.body}`} onSubmit={submit} noValidate>
            <p className={x.who}>
              <strong>{sale.customerName || 'Customer'}</strong>
              {plan ? ` · ${plan}` : ''}
            </p>
            {missed ? (
              <p className={x.note}>The carrier marked the last install as missed. Pick the new day.</p>
            ) : null}
            <div className={l.field}>
              <label htmlFor="install-date-input" className={l.label}>
                Install date
              </label>
              <input
                id="install-date-input"
                className={l.input}
                type="date"
                value={day}
                min={soldDay || undefined}
                max={maxInstallDay()}
                disabled={saving}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'install-date-hint install-date-error' : 'install-date-hint'}
                onChange={(event) => {
                  setDay(event.target.value);
                  setError(null);
                }}
              />
              <p id="install-date-hint" className={l.hint}>
                We&apos;ll update this automatically when the carrier&apos;s report changes it.
              </p>
              {error ? (
                <p id="install-date-error" className={l.fieldError} role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  {error}
                </p>
              ) : null}
            </div>
            <button type="submit" className={`${s.btnPrimary} ${s.btnBlock}`} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      </div>
    </BodyLayer>
  );
}
