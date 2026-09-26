import { AlertCircle, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { providers, recentSales, scanResult } from '../../_mock';
import n from '../native.module.css';
import s from '../sheet.module.css';

type Conf = 'high' | 'medium' | 'low';

function Field({
  label,
  name,
  value,
  confidence,
  note,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  value?: string;
  confidence?: Conf;
  note?: string;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric';
  autoComplete?: string;
  placeholder?: string;
}) {
  const flagged = confidence === 'low' || confidence === 'medium';
  return (
    <label className={flagged ? `${s.field} ${s.fieldFlag}` : s.field}>
      <span className={s.fieldLabel}>
        {label}
        {flagged && (
          <span className={s.flag}>
            <AlertCircle size={14} strokeWidth={2.5} aria-hidden />
            Check this
          </span>
        )}
      </span>
      <input
        className={s.input}
        name={name}
        type={type}
        defaultValue={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={flagged ? `${name}-note` : undefined}
      />
      {flagged && note && (
        <span className={s.flagNote} id={`${name}-note`}>
          {note}
        </span>
      )}
    </label>
  );
}

function Section({ title, children, foot }: { title: string; children: ReactNode; foot?: string }) {
  return (
    <section className={s.formSection} aria-label={title}>
      <h3 className={s.formHead}>{title}</h3>
      {children}
      {foot && <p className={n.groupFoot}>{foot}</p>}
    </section>
  );
}

/** Review form (prefilled from the scan) or the empty manual form. */
export function SaleForm({ prefilled }: { prefilled: boolean }) {
  const r = prefilled ? scanResult : null;
  const provider = r?.provider.value;
  const plans = recentSales
    .map((x) => x.plan)
    .filter((p, i, all) => all.indexOf(p) === i)
    .filter((p) => !provider || p.startsWith(provider));
  const p = prefilled ? 'r' : 'm';

  return (
    <div className={s.form}>
      <Section title="Provider">
        <fieldset className={n.segmented}>
          <legend className={n.srOnly}>Provider</legend>
          {providers.map((name) => (
            <label key={name} className={n.segment}>
              <input type="radio" name={`${p}-provider`} value={name} defaultChecked={name === provider} />
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
      </Section>

      <Section title="Sale">
        <div className={n.group}>
          <label className={s.field}>
            <span className={s.fieldLabel}>Plan</span>
            <span className={s.selectWrap}>
              <select className={s.input} name={`${p}-plan`} defaultValue={r?.plan.value ?? ''}>
                {!prefilled && (
                  <option value="" disabled>
                    Choose a plan
                  </option>
                )}
                {plans.map((plan) => (
                  <option key={plan}>{plan}</option>
                ))}
              </select>
              <ChevronsUpDown size={18} className={s.selectIcon} aria-hidden />
            </span>
          </label>
          <Field
            label="Order number"
            name={`${p}-order`}
            value={r?.orderNumber.value}
            confidence={r?.orderNumber.confidence}
            placeholder="From the confirmation"
          />
          <Field
            label="Install date"
            name={`${p}-install`}
            value={r?.installDate.value}
            confidence={r?.installDate.confidence}
            note="Blurry on the screenshot. Match it to the carrier's schedule."
            placeholder="e.g. Sep 26"
          />
        </div>
      </Section>

      <Section title="Customer">
        <div className={n.group}>
          <Field
            label="Name"
            name={`${p}-name`}
            value={r?.customerName.value}
            confidence={r?.customerName.confidence}
            autoComplete="off"
            placeholder="First and last"
          />
          <Field
            label="Phone"
            name={`${p}-phone`}
            type="tel"
            inputMode="tel"
            value={r?.phone.value}
            confidence={r?.phone.confidence}
            note="One digit was hard to read. Confirm it with the customer."
            autoComplete="off"
            placeholder="(555) 555-0100"
          />
          <Field
            label="Service address"
            name={`${p}-address`}
            value={r?.address.value}
            confidence={r?.address.confidence}
            autoComplete="off"
            placeholder="Street, city, ZIP"
          />
        </div>
      </Section>
    </div>
  );
}
