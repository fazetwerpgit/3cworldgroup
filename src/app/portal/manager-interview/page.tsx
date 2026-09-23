'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RepBoot, RepShell } from '@/components/portal/rep/RepShell';
import {
  Choices,
  Field,
  FormAlert,
  FormFrame,
  FormHeader,
  FormSection,
  FormSent,
  YesNo,
  describe,
  useAlertScroll,
  useFormCheck,
  type FieldRule,
} from '@/components/portal/rep/RepForm';
import f from '@/components/portal/rep/rep-forms.module.css';
import SignaturePad from '@/components/forms/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { isPromotionRole } from '@/lib/forms/managerInterview';

// Manager interview, direction D. Managers only (same role list as before).

const FORM_ID = 'manager-interview-form';

const EMPTY = {
  provider: '', jobPosition: '', hiringManager: '', hiringManagerEmail: '',
  candidateFirstName: '', candidateLastName: '', candidateEmail: '', market: '',
  didShow: false, extendOffer: false, rating: 1,
  completedProduction: false, completedReading: false, completedTeamMetric: false,
  signatureDataUrl: '',
};
type Form = typeof EMPTY;

const RULES: FieldRule<Form>[] = [
  { key: 'provider', id: 'provider', message: 'Pick the provider' },
  { key: 'jobPosition', id: 'jobPosition', message: 'Pick the job position' },
  { key: 'hiringManager', id: 'hiringManager', message: 'Pick the hiring manager' },
  { key: 'hiringManagerEmail', id: 'hiring-manager-email', message: "Enter the hiring manager's email", email: true },
  { key: 'candidateFirstName', id: 'candidate-first-name', message: 'Enter the first name' },
  { key: 'candidateLastName', id: 'candidate-last-name', message: 'Enter the last name' },
  { key: 'candidateEmail', id: 'candidate-email', message: "Enter the candidate's email", email: true },
  { key: 'market', id: 'market', message: 'Pick a market' },
  { key: 'signatureDataUrl', id: 'manager-signature', message: 'Sign to approve' },
];

const managerInterviewRoles = [
  'admin',
  'operations',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'regional_manager',
  'director',
] as const;

function ManagerInterviewForm() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  // Remounts the signature pad after a send so the next interview starts blank.
  const [round, setRound] = useState(0);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');
  const alertRef = useAlertScroll(error);
  const check = useFormCheck(form, RULES);

  const promo = isPromotionRole(form.jobPosition);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    check.clear(key);
  };
  const text = (key: 'hiringManagerEmail' | 'candidateFirstName' | 'candidateLastName' | 'candidateEmail', id: string) => ({
    id,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
    className: f.input,
    autoComplete: 'off',
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
      const res = await fetch('/api/portal/forms/manager-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setReferenceId(json.id);
      setForm(EMPTY);
      setRound((r) => r + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (referenceId) {
    return (
      <FormSent
        title="Interview sent"
        referenceId={referenceId}
        message="The decision and your signature are in the review queue."
        againLabel="Log another interview"
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
      header={<FormHeader title="Manager interview" lede="Record a final candidate interview and sign off on it." />}
      alert={error ? <FormAlert message={error} alertRef={alertRef} /> : null}
      submitLabel="Send interview"
      saving={saving}
      disabled={!form.signatureDataUrl}
      done={check.done}
      total={check.total}
      submitter={user?.displayName || user?.email || 'you'}
      routeTo="Manager review"
      note="The signed decision goes to the hiring team to act on."
    >
      <FormSection n={1} title="The role">
        <Choices
          name="provider"
          label="Provider"
          value={form.provider}
          options={options.providers}
          onChange={(value) => set('provider', value)}
          required
          error={check.errors.provider}
        />
        <Choices
          name="jobPosition"
          label="Job position"
          value={form.jobPosition}
          options={options.hireJobPositions}
          onChange={(value) => set('jobPosition', value)}
          required
          error={check.errors.jobPosition}
        />
        <Choices
          name="hiringManager"
          label="Hiring manager"
          value={form.hiringManager}
          options={options.hireManagers}
          onChange={(value) => set('hiringManager', value)}
          required
          error={check.errors.hiringManager}
        />
        <Field id="hiring-manager-email" label="Hiring manager email" required error={check.errors.hiringManagerEmail} wide>
          <input {...text('hiringManagerEmail', 'hiring-manager-email')} type="email" inputMode="email" />
        </Field>
      </FormSection>

      <FormSection n={2} title="The candidate">
        <Field id="candidate-first-name" label="First name" required error={check.errors.candidateFirstName}>
          <input {...text('candidateFirstName', 'candidate-first-name')} autoCapitalize="words" />
        </Field>
        <Field id="candidate-last-name" label="Last name" required error={check.errors.candidateLastName}>
          <input {...text('candidateLastName', 'candidate-last-name')} autoCapitalize="words" />
        </Field>
        <Field id="candidate-email" label="Candidate email" required error={check.errors.candidateEmail} wide>
          <input {...text('candidateEmail', 'candidate-email')} type="email" inputMode="email" />
        </Field>
        <Choices
          name="market"
          label="Market"
          value={form.market}
          options={options.hireMarkets}
          onChange={(value) => set('market', value)}
          required
          error={check.errors.market}
          emptyMessage="No markets set up yet. An admin can add them in Form Options."
        />
      </FormSection>

      <FormSection n={3} title="The decision">
        <YesNo name="didShow" label="Did the candidate show?" value={form.didShow} onChange={(v) => set('didShow', v)} />
        <YesNo name="extendOffer" label="Extend an offer?" value={form.extendOffer} onChange={(v) => set('extendOffer', v)} />
        <Choices
          name="rating"
          label="Rate the candidate (1 to 5)"
          value={String(form.rating)}
          options={['1', '2', '3', '4', '5']}
          onChange={(value) => set('rating', Number(value))}
          columns={5}
          required
        />
        {promo ? (
          <>
            <YesNo
              name="completedProduction"
              label="Promotion: completed production?"
              value={form.completedProduction}
              onChange={(v) => set('completedProduction', v)}
            />
            <YesNo
              name="completedReading"
              label="Promotion: completed reading?"
              value={form.completedReading}
              onChange={(v) => set('completedReading', v)}
            />
            <YesNo
              name="completedTeamMetric"
              label="Promotion: completed team metric?"
              value={form.completedTeamMetric}
              onChange={(v) => set('completedTeamMetric', v)}
            />
          </>
        ) : null}
      </FormSection>

      <FormSection n={4} title="Sign off">
        <div id="manager-signature" className={`${f.field} ${f.wide} ${check.errors.signatureDataUrl ? f.fieldInvalid : ''}`}>
          <span className={f.label}>
            Manager signature for approval
            <span className={f.req}>Required</span>
          </span>
          <SignaturePad key={round} onChange={(dataUrl) => set('signatureDataUrl', dataUrl ?? '')} />
          {check.errors.signatureDataUrl ? (
            <p className={f.fieldError} role="alert">
              {check.errors.signatureDataUrl}
            </p>
          ) : null}
        </div>
      </FormSection>
    </FormFrame>
  );
}

export default function ManagerInterviewPage() {
  return (
    <RepShell task="Manager interview">
      <ProtectedRoute roles={[...managerInterviewRoles]} fallback={<RepBoot />}>
        <ManagerInterviewForm />
      </ProtectedRoute>
    </RepShell>
  );
}
