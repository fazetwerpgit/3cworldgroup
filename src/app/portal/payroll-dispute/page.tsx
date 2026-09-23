'use client';

import { useState } from 'react';
import { RepShell } from '@/components/portal/rep/RepShell';
import {
  Attachment,
  Choices,
  Field,
  FormAlert,
  FormFrame,
  FormHeader,
  FORMS_BACK,
  FormSection,
  FormSent,
  UPLOADING_MESSAGE,
  describe,
  useAlertScroll,
  useFormCheck,
  useUploadsInFlight,
  type FieldRule,
} from '@/components/portal/rep/RepForm';
import f from '@/components/portal/rep/rep-forms.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { newFormUploadId } from '@/lib/forms/formUploads';
import { uploadFormAttachment } from '@/lib/forms/uploadFormAttachment';

// Payroll dispute, direction D. The dashboard's "Missing an install?" link and
// the pay help sheet's "Report a missing install" both land here.

const FORM_ID = 'payroll-dispute-form';

const EMPTY = {
  contractorName: '', contractorEmail: '', campaign: '',
  typeOfOrder: '', dateOfInstall: '', orderScreenshotPath: '',
};
type Form = typeof EMPTY;

const RULES: FieldRule<Form>[] = [
  { key: 'contractorName', id: 'contractor-name', message: 'Enter your name' },
  { key: 'contractorEmail', id: 'contractor-email', message: 'Enter your email', email: true },
  { key: 'campaign', id: 'campaign', message: 'Pick the campaign' },
  { key: 'typeOfOrder', id: 'type-of-order', message: 'Enter the type of order' },
  { key: 'dateOfInstall', id: 'date-of-install', message: 'Enter the install date' },
];

const getHeaders = async (): Promise<HeadersInit> => {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function PayrollDisputeForm() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  // One upload folder per dispute (form-attachments/{uid}/payroll-dispute/{uploadId}/),
  // so a second dispute can never overwrite the proof on an earlier open one.
  const [uploadId, setUploadId] = useState(newFormUploadId);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');
  const alertRef = useAlertScroll(error);
  const check = useFormCheck(form, RULES);
  const { uploading, onBusyChange } = useUploadsInFlight();

  const set = (key: keyof Form, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    check.clear(key);
  };
  const text = (key: keyof Form, id: string) => ({
    id,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
    className: f.input,
    ...describe(id, check.errors[key]),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    if (!check.validate()) return;
    if (uploading) {
      setError(UPLOADING_MESSAGE);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/payroll-dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, uploadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setReferenceId(json.id);
      setForm(EMPTY);
      setUploadId(newFormUploadId()); // next dispute gets a fresh folder (and a fresh upload widget)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (referenceId) {
    return (
      <FormSent
        title="Dispute sent"
        referenceId={referenceId}
        message="Payroll has it with your proof."
        againLabel="Send another dispute"
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
      header={
        <FormHeader
          title="Payroll dispute"
          lede="Install missing from your pay, or paid wrong? Send the order and a screenshot and payroll looks at the account."
        />
      }
      alert={error ? <FormAlert message={error} alertRef={alertRef} /> : null}
      submitLabel="Send dispute"
      saving={saving}
      uploading={uploading}
      submitter={user?.displayName || user?.email || 'you'}
    >
      <FormSection title="Who you are">
        <Field id="contractor-name" label="Contractor name" required error={check.errors.contractorName}>
          <input {...text('contractorName', 'contractor-name')} autoComplete="name" />
        </Field>
        <Field id="contractor-email" label="Contractor email" required error={check.errors.contractorEmail}>
          <input {...text('contractorEmail', 'contractor-email')} type="email" inputMode="email" autoComplete="email" />
        </Field>
      </FormSection>

      <FormSection title="What happened">
        <Choices
          name="campaign"
          label="Campaign"
          value={form.campaign}
          options={options.payrollCampaigns}
          onChange={(value) => set('campaign', value)}
          required
          error={check.errors.campaign}
        />
        <Field id="type-of-order" label="Type of order" required error={check.errors.typeOfOrder}>
          <input {...text('typeOfOrder', 'type-of-order')} autoComplete="off" />
        </Field>
        <Field id="date-of-install" label="Date of install" required error={check.errors.dateOfInstall}>
          <input {...text('dateOfInstall', 'date-of-install')} autoComplete="off" placeholder="MM/DD/YYYY" />
        </Field>
      </FormSection>

      <FormSection title="Proof">
        <Attachment
          key={uploadId}
          id="payroll-proof"
          label="Screenshot or proof"
          accept="image/*,application/pdf"
          hint="Order ID, campaign and pay line visible in one frame."
          upload={(file, signal) =>
            uploadFormAttachment({
              file,
              itemId: 'payroll-dispute',
              formType: 'payroll-dispute',
              fields: { uploadId },
              getHeaders,
              signal,
            })
          }
          onUploaded={(path) => setForm((p) => ({ ...p, orderScreenshotPath: path }))}
          onBusyChange={onBusyChange}
        />
      </FormSection>
    </FormFrame>
  );
}

export default function PayrollDisputePage() {
  return (
    <RepShell task="Payroll dispute" back={FORMS_BACK}>
      <PayrollDisputeForm />
    </RepShell>
  );
}
