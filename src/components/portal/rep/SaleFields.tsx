'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { FIBER_COMPANIES, SALE_TYPES, getPlanById, getPlansByCompany } from '@/types';
import type { SaleFieldKey, SaleFormFields, SaleFormState } from '@/hooks/useSaleFormState';
import { isExtraPlanId } from '@/lib/sales/planSelection';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import type { ScanTarget } from './useSaleScan';
import s from './rep.module.css';
import l from './rep-logsale.module.css';

// The sale's detail fields (order, customer and install, more details), shared
// by the Log Sale page and the bulk uploader's edit sheet so both follow the
// same rules and look the same. The state lives in useSaleFormState.

/** Short provider names for the segmented control ("TFiber", not "TFiber (T-Mobile)"). */
const PROVIDER_SHORT: Record<string, string> = {
  tfiber: 'TFiber',
  att: 'AT&T Fiber',
  frontier: 'Frontier',
  xfinity: 'Xfinity',
};

export const DEFAULT_PROVIDER = 'tfiber';

export function Field({
  id,
  label,
  error,
  hint,
  required,
  wide,
  flag,
  reading,
  filled,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  wide?: boolean;
  /** Filled from the screenshot without full confidence: the rep should check it. */
  flag?: 'low' | 'medium';
  /** The screenshot is being read and may fill this field. */
  reading?: boolean;
  /** The screenshot filled this field: it takes a brief tint as the value lands. */
  filled?: boolean;
  children: ReactNode;
}) {
  const flagClass = flag === 'low' ? l.flagLow : flag === 'medium' ? l.flagMedium : '';
  return (
    <div className={`${l.field} ${error ? l.fieldInvalid : flagClass} ${wide ? l.wide : ''} ${filled ? l.fieldFilled : ''}`}>
      <label htmlFor={id} className={l.label}>
        {label}
        {flag && !error ? (
          <span className={l.flagTag}>
            <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
            Check this
          </span>
        ) : required ? (
          <span className={l.req}>Required</span>
        ) : null}
      </label>
      {reading ? (
        <span className={l.readWrap}>
          {children}
          <span className={`${s.skel} ${l.readSkel}`} aria-hidden="true" />
        </span>
      ) : (
        children
      )}
      {error ? (
        <p id={`${id}-error`} className={l.fieldError}>
          <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={l.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for an input whose Field may show an error or a hint. */
function describe(id: string, error: string | undefined, hasHint: boolean) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}

/** What the screenshot reader tells the fields: skeletons, "Check this" flags, the fill tint. */
export type SaleFieldsScan = {
  pending: (target: ScanTarget) => boolean;
  edited: (target: ScanTarget) => void;
  seen: (target: ScanTarget) => void;
  flags: Partial<Record<ScanTarget, 'low' | 'medium'>>;
  filled?: ReadonlySet<ScanTarget>;
};

export type SaleFieldsForm = Pick<
  SaleFormState,
  'formData' | 'errors' | 'products' | 'addPlan' | 'toggleExtra' | 'handleChange' | 'saleDateFromInstall'
>;

export function SaleFields({
  form,
  provider,
  onProvider,
  orderRequired,
  orderHint = 'Needed when there is no screenshot.',
  scan,
  moreOpen,
  onMoreOpen,
}: {
  form: SaleFieldsForm;
  /** The provider shown: the plan's, else the rep's pick, else DEFAULT_PROVIDER. */
  provider: string;
  onProvider: (company: string) => void;
  /** No screenshot: the order number is the proof. */
  orderRequired: boolean;
  /** Under a required order number (the bulk log needs it even with a screenshot). */
  orderHint?: string;
  scan: SaleFieldsScan;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
}) {
  const { formData, errors, products } = form;
  const internetPlans = getPlansByCompany(provider).filter((plan) => plan.category !== 'extra');
  const extras = getPlansByCompany(provider).filter((plan) => plan.category === 'extra');
  const internetId = products.find((p) => !isExtraPlanId(p.productId))?.productId ?? '';
  const showMore = moreOpen || Boolean(errors.saleDate);

  const input = (
    name: keyof SaleFormFields,
    options: { error?: SaleFieldKey; hint?: boolean } = {}
  ) => {
    const reading = scan.pending(name as ScanTarget);
    return {
      id: name,
      name,
      value: formData[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        scan.edited(name as ScanTarget);
        form.handleChange(e);
      },
      onFocus: () => scan.seen(name as ScanTarget),
      className: reading ? `${l.input} ${l.inputReading}` : l.input,
      'aria-busy': reading || undefined,
      ...describe(name, options.error ? errors[options.error] : undefined, Boolean(options.hint)),
    };
  };
  /** Field props for a field the screenshot reader can fill. */
  const scanned = (target: ScanTarget) => ({
    flag: scan.flags[target],
    reading: scan.pending(target),
    filled: scan.filled?.has(target) ?? false,
  });

  return (
    <div className={l.groups}>
      <section className={l.group} aria-labelledby="group-order">
        <h2 id="group-order" className={`${s.kicker} ${l.groupHead}`}>
          Order
        </h2>
        <div className={l.formGrid}>
          <fieldset className={`${l.field} ${l.fieldset} ${l.wide}`}>
            <legend className={l.label}>Provider</legend>
            <div className={l.segmented}>
              {FIBER_COMPANIES.map((company) => (
                <label key={company.value} className={l.chip}>
                  <input
                    type="radio"
                    name="provider"
                    value={company.value}
                    checked={provider === company.value}
                    onChange={() => onProvider(company.value)}
                  />
                  {PROVIDER_SHORT[company.value] ?? company.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Field id="plan" label="Plan" error={errors.plan} required {...scanned('plan')}>
            <span className={l.selectWrap}>
              <select
                id="plan"
                className={scan.pending('plan') ? `${l.input} ${l.inputReading}` : l.input}
                value={internetId}
                onChange={(e) => {
                  scan.edited('plan');
                  const plan = getPlanById(e.target.value);
                  if (plan) form.addPlan(plan);
                }}
                onFocus={() => scan.seen('plan')}
                aria-busy={scan.pending('plan') || undefined}
                {...describe('plan', errors.plan, false)}
              >
                <option value="" disabled>
                  Choose a plan
                </option>
                {internetPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
          </Field>

          <Field
            id="orderNumberOrBtn"
            label="Order number or BTN"
            required={orderRequired}
            error={errors.orderNumberOrBtn}
            hint={orderRequired ? orderHint : undefined}
            {...scanned('orderNumberOrBtn')}
          >
            <input
              {...input('orderNumberOrBtn', { error: 'orderNumberOrBtn', hint: orderRequired })}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </Field>

          {extras.length > 0 ? (
            <fieldset className={`${l.field} ${l.fieldset} ${l.wide}`}>
              <legend className={l.label}>Extras sold</legend>
              <ul className={l.extras}>
                {extras.map((plan) => {
                  const on = products.some((p) => p.productId === plan.id);
                  return (
                    <li key={plan.id}>
                      <label className={l.extra}>
                        <input type="checkbox" checked={on} onChange={() => form.toggleExtra(plan)} />
                        <span className={l.extraBox} aria-hidden="true">
                          {on ? <Check size={14} strokeWidth={3} /> : null}
                        </span>
                        <span className={l.extraName}>{plan.name}</span>
                        <span className={l.extraKind}>{plan.speed}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}
        </div>
      </section>

      <section className={l.group} aria-labelledby="group-customer">
        <h2 id="group-customer" className={`${s.kicker} ${l.groupHead}`}>
          Customer and install
        </h2>
        <div className={l.formGrid}>
          <Field id="customerName" label="Customer name" {...scanned('customerName')}>
            <input {...input('customerName')} type="text" autoComplete="off" autoCapitalize="words" />
          </Field>

          <Field id="customerPhone" label="Phone" {...scanned('customerPhone')}>
            <input {...input('customerPhone')} type="tel" inputMode="tel" autoComplete="off" />
          </Field>

          <Field
            id="customerAddress"
            label="Service address"
            required
            error={errors.customerAddress}
            {...scanned('customerAddress')}
          >
            <input
              {...input('customerAddress', { error: 'customerAddress' })}
              type="text"
              autoComplete="off"
              placeholder="Street, city, state, ZIP"
            />
          </Field>

          <Field
            id="installDate"
            label="Install date"
            required
            error={errors.installDate}
            {...scanned('installDate')}
          >
            <input {...input('installDate', { error: 'installDate' })} type="date" />
          </Field>
        </div>
      </section>

      <details
        className={`${l.group} ${l.more}`}
        open={showMore}
        onToggle={(e) => onMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className={l.moreSummary}>
          <span>More details</span>
          <span className={l.moreSub}>Email, sale type, sale date, notes</span>
          <ChevronDown size={20} aria-hidden="true" className={l.moreChev} />
        </summary>
        <div className={l.moreGrid}>
          <Field id="customerEmail" label="Email">
            <input {...input('customerEmail')} type="email" inputMode="email" autoComplete="off" />
          </Field>
          <Field id="saleType" label="Sale type">
            <span className={l.selectWrap}>
              <select {...input('saleType')}>
                {SALE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
          </Field>
          <Field
            id="saleDate"
            label="Sale date"
            error={errors.saleDate}
            hint={
              form.saleDateFromInstall
                ? 'Dated to the install day. Change it if the sale happened earlier.'
                : 'The day the customer signed up, not the install day.'
            }
          >
            <input {...input('saleDate', { error: 'saleDate', hint: true })} type="date" max={todaySaleDateInput()} />
          </Field>
          <Field id="notes" label="Notes">
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={(e) => {
                scan.edited('notes');
                form.handleChange(e);
              }}
              className={`${l.input} ${l.textarea}`}
              rows={3}
              placeholder="Anything the reviewer should know"
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
