'use client';

import { useState } from 'react';
import { RepShell } from '@/components/portal/rep/RepShell';
import {
  Choices,
  Field,
  FormAlert,
  FormFrame,
  FormHeader,
  FORMS_BACK,
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

// Fiber report, direction D. Company and date are required; the counts are
// optional whole numbers (the API enforces the same).

const FORM_ID = 'fiber-report-form';

const EMPTY = {
  companySold: '', dateKnocked: '', packNumber: '', numberOfReps: '',
  doorsKnocked: '', customerContacts: '', numberOfSales: '', orderNumber: '',
};
type Form = typeof EMPTY;

const RULES: FieldRule<Form>[] = [
  { key: 'companySold', id: 'companySold', message: 'Pick the company sold' },
  { key: 'dateKnocked', id: 'date-knocked', message: 'Enter the date knocked' },
];

function FiberReportForm() {
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
  const text = (key: keyof Form, id: string, numeric = false) => ({
    id,
    value: form[key],
    // Counts take digits only, so a typo can't land as text.
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, numeric ? e.target.value.replace(/\D/g, '') : e.target.value),
    className: f.input,
    autoComplete: 'off',
    ...(numeric ? { inputMode: 'numeric' as const } : {}),
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
      const res = await fetch('/api/portal/forms/fiber-report', {
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
        title="Report sent"
        referenceId={referenceId}
        message="Your fiber activity is in the review queue."
        againLabel="Send another report"
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
      header={<FormHeader title="Fiber report" lede="Log a pack's door knocking and fiber sales." />}
      alert={error ? <FormAlert message={error} alertRef={alertRef} /> : null}
      submitLabel="Send report"
      saving={saving}
      submitter={user?.displayName || user?.email || 'you'}
    >
      <FormSection title="The pack">
        <Choices
          name="companySold"
          label="Company sold"
          value={form.companySold}
          options={options.providers}
          onChange={(companySold) => set('companySold', companySold)}
          required
          error={check.errors.companySold}
        />
        <Field id="date-knocked" label="Date knocked" required error={check.errors.dateKnocked}>
          <input {...text('dateKnocked', 'date-knocked')} placeholder="MM/DD/YYYY" />
        </Field>
        <Field id="pack-number" label="Pack number">
          <input {...text('packNumber', 'pack-number')} />
        </Field>
      </FormSection>

      <FormSection title="The numbers">
        <Field id="number-of-reps" label="Number of reps">
          <input {...text('numberOfReps', 'number-of-reps', true)} />
        </Field>
        <Field id="doors-knocked" label="Doors knocked">
          <input {...text('doorsKnocked', 'doors-knocked', true)} />
        </Field>
        <Field id="customer-contacts" label="Customer contacts">
          <input {...text('customerContacts', 'customer-contacts', true)} />
        </Field>
        <Field id="number-of-sales" label="Number of sales">
          <input {...text('numberOfSales', 'number-of-sales', true)} />
        </Field>
        <Field id="order-number" label="Order number" wide>
          <input {...text('orderNumber', 'order-number')} autoCapitalize="characters" />
        </Field>
      </FormSection>
    </FormFrame>
  );
}

export default function FiberReportPage() {
  return (
    <RepShell task="Fiber report" back={FORMS_BACK}>
      <FiberReportForm />
    </RepShell>
  );
}
