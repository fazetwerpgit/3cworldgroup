'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  FormsLineAlert,
  FormsLineChoicePicker,
  FormsLineControl,
  FormsLineActions,
  FormsLineFormHeader,
  FormsLineIdentity,
  FormsLineRail,
  FormsLineSection,
  FormsLineShell,
  FormsLineSuccess,
} from '@/components/forms/FormsLine';
import FileUpload from '@/components/onboarding/FileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

const EMPTY = {
  contractorName: '', contractorEmail: '', campaign: '',
  typeOfOrder: '', dateOfInstall: '', orderScreenshotPath: '',
};

export default function PayrollDisputePage() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/payroll-dispute', {
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

  const displayName = user?.displayName || user?.email || 'current user';
  const role = getEffectiveRole(user);
  const roleLabel = role ? RoleDisplayNames[role] : 'Portal user';

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <section className="forms-line-fill" aria-labelledby="payroll-dispute-title">
          <FormsLineFormHeader title="Payroll Dispute" lane="03" />
          {error && <FormsLineAlert kind="error">{error}</FormsLineAlert>}
          <div className="forms-line-fill-body">
            <div>
              <form onSubmit={submit}>
                <FormsLineSection
                  index={1}
                  title="Who you are"
                  identity={<FormsLineIdentity name={displayName} role={roleLabel} />}
                >
                  <FormsLineControl id="contractor-name" label="Contractor name" required>
                    <input id="contractor-name" autoComplete="name" value={form.contractorName} onChange={(e) => setForm((p) => ({ ...p, contractorName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="contractor-email" label="Contractor email" required>
                    <input id="contractor-email" autoComplete="email" value={form.contractorEmail} onChange={(e) => setForm((p) => ({ ...p, contractorEmail: e.target.value }))} required />
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineSection index={2} title="What happened">
                  <FormsLineChoicePicker
                    name="campaign"
                    label="Campaign"
                    value={form.campaign}
                    options={options.payrollCampaigns}
                    onChange={(campaign) => setForm((p) => ({ ...p, campaign }))}
                    required
                  />
                  <FormsLineControl id="type-of-order" label="Type of order" required>
                    <input id="type-of-order" value={form.typeOfOrder} onChange={(e) => setForm((p) => ({ ...p, typeOfOrder: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="date-of-install" label="Date of install" required>
                    <input id="date-of-install" placeholder="MM/DD/YYYY" value={form.dateOfInstall} onChange={(e) => setForm((p) => ({ ...p, dateOfInstall: e.target.value }))} required />
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineSection index={3} title="Proof">
                  <FormsLineControl id="payroll-proof" label="Screenshot or proof" className="forms-line-field-full">
                    <div className="forms-line-upload">
                      <FileUpload
                        itemId="payroll-dispute"
                        accept="image/*,application/pdf"
                        allowedTypes={FORM_ATTACHMENT_TYPES}
                        uploadUrl="/api/portal/forms/upload"
                        extraFields={{ formType: 'payroll-dispute' }}
                        getHeaders={async (): Promise<HeadersInit> => {
                          const token = await auth?.currentUser?.getIdToken();
                          return token ? { Authorization: `Bearer ${token}` } : {};
                        }}
                        onUploaded={(path) => setForm((p) => ({ ...p, orderScreenshotPath: path }))}
                      />
                      <p className="forms-line-proof-hint"><strong>Good proof:</strong> order ID, campaign, and pay line visible in one frame. PNG, JPG, WEBP, HEIC, or PDF · 4 MB max.</p>
                    </div>
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineActions verb="dispute" saving={saving} />
              </form>
              {referenceId && (
                <FormsLineSuccess
                  title="Dispute received"
                  referenceId={referenceId}
                  message="We received the dispute and its supporting details. The payroll owner can follow up through the portal record."
                />
              )}
            </div>
            <FormsLineRail status="Ready for payroll review" note="One clear proof frame keeps the handoff moving." />
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
