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
import { LEADS_CATEGORIES, LEADS_REASONS } from '@/lib/forms/formOptions';
import { leadsConditions } from '@/lib/forms/leadsPredicates';
import { newFormUploadId } from '@/lib/forms/formUploads';
import { uploadFormAttachment } from '@/lib/forms/uploadFormAttachment';

// Leads request, direction D. Category, reason and location reveal the
// conditional details and proof slots (leadsConditions, shared with the API).

const FORM_ID = 'leads-request-form';

const EMPTY = {
  campaign: '', managerName: '', managerEmail: '', repFirstName: '', repLastName: '',
  location: '', category: '', reason: '', specialRequest: '', leadPackCode: '',
  situationDescription: '', hostileUploadPath: '', blindKnockUploadPath: '',
  lassoUploadPath: '', newRepPhone: '', newRepEmail: '',
};
type Form = typeof EMPTY;

const RULES: FieldRule<Form>[] = [
  { key: 'campaign', id: 'campaign', message: 'Pick the campaign' },
  { key: 'managerName', id: 'managerName', message: 'Pick your manager' },
  { key: 'managerEmail', id: 'manager-email', message: "Enter your manager's email" },
  { key: 'repFirstName', id: 'rep-first-name', message: 'Enter the first name' },
  { key: 'repLastName', id: 'rep-last-name', message: 'Enter the last name' },
  { key: 'location', id: 'location', message: 'Pick a location' },
];

const getHeaders = async (): Promise<HeadersInit> => {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Slot = 'hostile' | 'blind-knock' | 'lasso';
const SLOT_FIELD: Record<Slot, keyof Form> = {
  hostile: 'hostileUploadPath',
  'blind-knock': 'blindKnockUploadPath',
  lasso: 'lassoUploadPath',
};

function LeadsRequestForm() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  // One upload folder per submission (form-attachments/{uid}/leads-request/{uploadId}/{slot}/),
  // so a later request can never overwrite an earlier request's attachments.
  const [uploadId, setUploadId] = useState(newFormUploadId);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');
  const alertRef = useAlertScroll(error);
  const check = useFormCheck(form, RULES);
  const { uploading, onBusyChange } = useUploadsInFlight();

  const cond = leadsConditions({ category: form.category, reason: form.reason, location: form.location });
  const hasConditionalDetails =
    cond.needsSpecialRequest || cond.needsLeadPackCode || cond.needsHostile || cond.needsBlindKnock || cond.needsNewRep;
  const hasUploads = cond.needsHostile || cond.needsBlindKnock || cond.needsLasso;

  const set = (key: keyof Form, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    check.clear(key);
  };
  const text = (key: keyof Form, id: string) => ({
    id,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
    className: f.input,
    autoComplete: 'off',
    ...describe(id, check.errors[key]),
  });

  const attachment = (slot: Slot, id: string, label: string) => (
    <Attachment
      key={`${slot}-${uploadId}`}
      id={id}
      label={label}
      accept="image/*,application/pdf"
      upload={(file) =>
        uploadFormAttachment({
          file,
          itemId: `leads-request-${slot}`,
          formType: 'leads-request',
          slot,
          fields: { uploadId },
          getHeaders,
        })
      }
      onUploaded={(path) => setForm((p) => ({ ...p, [SLOT_FIELD[slot]]: path }))}
      onBusyChange={onBusyChange}
    />
  );

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
      const res = await fetch('/api/portal/forms/leads-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, uploadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setReferenceId(json.id);
      setForm(EMPTY);
      setUploadId(newFormUploadId()); // next request gets a fresh folder (and fresh upload widgets)
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
        message="The lead request is in the review queue. The team follows up through the portal record."
        againLabel="Send another request"
        onAgain={() => {
          setReferenceId('');
          check.reset();
        }}
      />
    );
  }

  let n = 0;
  return (
    <FormFrame
      formId={FORM_ID}
      onSubmit={submit}
      header={<FormHeader title="Leads request" lede="Ask for a lead pack, or flag a problem in your territory." />}
      alert={error ? <FormAlert message={error} alertRef={alertRef} /> : null}
      submitLabel="Send request"
      saving={saving}
      uploading={uploading}
      done={check.done}
      total={check.total}
      submitter={user?.displayName || user?.email || 'you'}
      routeTo="Lead review"
      note="Your choices show the team what help is needed."
    >
      <FormSection n={++n} title="Who it's for">
        <Choices
          name="campaign"
          label="Campaign"
          value={form.campaign}
          options={options.leadsCampaigns}
          onChange={(value) => set('campaign', value)}
          required
          error={check.errors.campaign}
        />
        <Choices
          name="managerName"
          label="Manager"
          value={form.managerName}
          options={options.leadsManagers}
          onChange={(value) => set('managerName', value)}
          required
          error={check.errors.managerName}
        />
        <Field id="manager-email" label="Manager email" required error={check.errors.managerEmail} wide>
          <input {...text('managerEmail', 'manager-email')} type="email" inputMode="email" />
        </Field>
        <Field id="rep-first-name" label="Rep first name" required error={check.errors.repFirstName}>
          <input {...text('repFirstName', 'rep-first-name')} autoCapitalize="words" />
        </Field>
        <Field id="rep-last-name" label="Rep last name" required error={check.errors.repLastName}>
          <input {...text('repLastName', 'rep-last-name')} autoCapitalize="words" />
        </Field>
        <Choices
          name="location"
          label="Location"
          value={form.location}
          options={options.leadsLocations}
          onChange={(value) => set('location', value)}
          required
          error={check.errors.location}
        />
      </FormSection>

      <FormSection n={++n} title="The request">
        <Choices
          name="category"
          label="Category"
          value={form.category}
          options={LEADS_CATEGORIES}
          onChange={(value) => set('category', value)}
        />
        <Choices
          name="reason"
          label="Reason"
          value={form.reason}
          options={LEADS_REASONS}
          onChange={(value) => set('reason', value)}
        />
      </FormSection>

      {hasConditionalDetails ? (
        <FormSection n={++n} title="Details">
          {cond.needsSpecialRequest ? (
            <Field id="special-request" label="Special request explanation" wide>
              <textarea {...text('specialRequest', 'special-request')} className={`${f.input} ${f.textarea}`} rows={3} />
            </Field>
          ) : null}
          {cond.needsLeadPackCode ? (
            <Field id="lead-pack-code" label="Lead pack code">
              <input {...text('leadPackCode', 'lead-pack-code')} autoCapitalize="characters" />
            </Field>
          ) : null}
          {cond.needsHostile || cond.needsBlindKnock ? (
            <Field id="situation-description" label="What happened" wide>
              <textarea
                {...text('situationDescription', 'situation-description')}
                className={`${f.input} ${f.textarea}`}
                rows={4}
              />
            </Field>
          ) : null}
          {cond.needsNewRep ? (
            <>
              <Field id="new-rep-phone" label="New rep phone">
                <input {...text('newRepPhone', 'new-rep-phone')} type="tel" inputMode="tel" />
              </Field>
              <Field id="new-rep-email" label="New rep email">
                <input {...text('newRepEmail', 'new-rep-email')} type="email" inputMode="email" />
              </Field>
            </>
          ) : null}
        </FormSection>
      ) : null}

      {hasUploads ? (
        <FormSection n={++n} title="Proof">
          {cond.needsHostile ? attachment('hostile', 'hostile-attachment', 'Hostile situation proof') : null}
          {cond.needsBlindKnock ? attachment('blind-knock', 'blind-knock-attachment', 'Blind-knock proof') : null}
          {cond.needsLasso ? attachment('lasso', 'lasso-attachment', 'Lasso attachment') : null}
        </FormSection>
      ) : null}
    </FormFrame>
  );
}

export default function LeadsRequestPage() {
  return (
    <RepShell task="Leads request">
      <LeadsRequestForm />
    </RepShell>
  );
}
