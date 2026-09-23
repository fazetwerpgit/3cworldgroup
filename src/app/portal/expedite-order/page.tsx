'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RepShell } from '@/components/portal/rep/RepShell';
import {
  Choices,
  Field,
  FormAlert,
  FormFrame,
  FormHeader,
  FormSection,
  FormSent,
  describe,
  useAlertScroll,
  useFormCheck,
  type FieldRule,
} from '@/components/portal/rep/RepForm';
import f from '@/components/portal/rep/rep-forms.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { US_STATES } from '@/lib/validation/address';

// Expedite order, direction D.

const FORM_ID = 'expedite-order-form';

const EMPTY = {
  customerName: '', customerPhone: '', customerEmail: '',
  address: '', city: '', state: '', zip: '',
  orderNumber: '', expediteDates: '', reason: '',
};
type Form = typeof EMPTY;

const RULES: FieldRule<Form>[] = [
  { key: 'customerName', id: 'customer-name', message: "Enter the customer's name" },
  { key: 'customerPhone', id: 'customer-phone', message: "Enter the customer's phone" },
  { key: 'orderNumber', id: 'order-number', message: 'Enter the order number' },
  { key: 'expediteDates', id: 'expedite-dates', message: 'Enter the dates you want' },
  { key: 'reason', id: 'reason', message: 'Pick a reason' },
];

function ExpediteOrderForm() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');
  const alertRef = useAlertScroll(error);
  const check = useFormCheck(form, RULES);

  const set = (key: keyof Form, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    check.clear(key);
  };
  const text = (key: keyof Form, id: string) => ({
    id,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, e.target.value),
    className: f.input,
    ...describe(id, check.errors[key]),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    if (!check.validate()) return;
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/expedite-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setReferenceId(json.id);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (referenceId) {
    return (
      <FormSent
        title="Request sent"
        referenceId={referenceId}
        message="The expedite request is in the review queue. The team follows up through the portal record."
        againLabel="Send another request"
        onAgain={() => {
          setReferenceId('');
          check.reset();
        }}
      />
    );
  }

  return (
    <FormFrame
      formId={FORM_ID}
      onSubmit={submit}
      header={<FormHeader title="Expedite order" lede="Ask for a faster install when the timing matters." />}
      alert={error ? <FormAlert message={error} alertRef={alertRef} /> : null}
      submitLabel="Send request"
      saving={saving}
      done={check.done}
      total={check.total}
      submitter={user?.displayName || user?.email || 'you'}
      routeTo="Order review"
      note="The dates and the reason help the team plan the install."
    >
      <FormSection n={1} title="The customer">
        <Field id="customer-name" label="Customer name" required error={check.errors.customerName}>
          <input {...text('customerName', 'customer-name')} autoComplete="off" autoCapitalize="words" />
        </Field>
        <Field id="customer-phone" label="Customer phone" required error={check.errors.customerPhone}>
          <input {...text('customerPhone', 'customer-phone')} type="tel" inputMode="tel" autoComplete="off" />
        </Field>
        <Field id="customer-email" label="Customer email" wide>
          <input {...text('customerEmail', 'customer-email')} type="email" inputMode="email" autoComplete="off" />
        </Field>
      </FormSection>

      <FormSection n={2} title="The install">
        <Field id="address" label="Street address" wide>
          <input {...text('address', 'address')} autoComplete="off" />
        </Field>
        <Field id="city" label="City">
          <input {...text('city', 'city')} autoComplete="off" />
        </Field>
        <Field id="state" label="State">
          <span className={f.selectWrap}>
            <select {...text('state', 'state')}>
              <option value="">Select state</option>
              {US_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </span>
        </Field>
        <Field id="zip" label="ZIP">
          <input {...text('zip', 'zip')} inputMode="numeric" autoComplete="off" placeholder="12345" />
        </Field>
        <Field id="order-number" label="Order number" required error={check.errors.orderNumber}>
          <input {...text('orderNumber', 'order-number')} autoComplete="off" autoCapitalize="characters" />
        </Field>
        <Field id="expedite-dates" label="Dates you want" required error={check.errors.expediteDates} wide>
          <textarea
            {...text('expediteDates', 'expedite-dates')}
            className={`${f.input} ${f.textarea}`}
            maxLength={300}
            rows={3}
            placeholder="e.g. Any day this week, mornings"
          />
        </Field>
        <Choices
          name="reason"
          label="Reason for the expedite"
          value={form.reason}
          options={options.expediteReasons}
          onChange={(value) => set('reason', value)}
          required
          error={check.errors.reason}
        />
      </FormSection>
    </FormFrame>
  );
}

export default function ExpediteOrderPage() {
  return (
    <RepShell task="Expedite order">
      <ExpediteOrderForm />
    </RepShell>
  );
}
