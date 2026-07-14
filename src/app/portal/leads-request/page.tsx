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
import { LEADS_CATEGORIES, LEADS_REASONS } from '@/lib/forms/formOptions';
import { leadsConditions } from '@/lib/forms/leadsPredicates';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

const EMPTY = {
  campaign: '', managerName: '', managerEmail: '', repFirstName: '', repLastName: '',
  location: '', category: '', reason: '', specialRequest: '', leadPackCode: '',
  situationDescription: '', hostileUploadPath: '', blindKnockUploadPath: '',
  lassoUploadPath: '', newRepPhone: '', newRepEmail: '',
};

export default function LeadsRequestPage() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');

  const cond = leadsConditions({ category: form.category, reason: form.reason, location: form.location });
  const hasConditionalDetails = cond.needsSpecialRequest || cond.needsLeadPackCode || cond.needsHostile || cond.needsBlindKnock || cond.needsNewRep;
  const hasUploads = cond.needsHostile || cond.needsBlindKnock || cond.needsLasso;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/leads-request', {
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

  const getHeaders = async (): Promise<HeadersInit> => {
    const token = await auth?.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const displayName = user?.displayName || user?.email || 'current user';
  const role = getEffectiveRole(user);
  const roleLabel = role ? RoleDisplayNames[role] : 'Portal user';

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <section className="forms-line-fill" aria-labelledby="leads-request-title">
          <FormsLineFormHeader title="Leads Request" lane="04" />
          {error && <FormsLineAlert kind="error">{error}</FormsLineAlert>}
          <div className="forms-line-fill-body">
            <div>
              <form onSubmit={submit}>
                <FormsLineSection
                  index={1}
                  title="Who you are"
                  identity={<FormsLineIdentity name={displayName} role={roleLabel} />}
                >
                  <FormsLineChoicePicker
                    name="campaign"
                    label="Campaign"
                    value={form.campaign}
                    options={options.leadsCampaigns}
                    onChange={(campaign) => setForm((p) => ({ ...p, campaign }))}
                    required
                  />
                  <FormsLineChoicePicker
                    name="managerName"
                    label="Manager name"
                    value={form.managerName}
                    options={options.leadsManagers}
                    onChange={(managerName) => setForm((p) => ({ ...p, managerName }))}
                    required
                  />
                  <FormsLineControl id="manager-email" label="Manager email" required>
                    <input id="manager-email" value={form.managerEmail} onChange={(e) => setForm((p) => ({ ...p, managerEmail: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="rep-first-name" label="Rep first name" required>
                    <input id="rep-first-name" value={form.repFirstName} onChange={(e) => setForm((p) => ({ ...p, repFirstName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="rep-last-name" label="Rep last name" required>
                    <input id="rep-last-name" value={form.repLastName} onChange={(e) => setForm((p) => ({ ...p, repLastName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineChoicePicker
                    name="location"
                    label="Location"
                    value={form.location}
                    options={options.leadsLocations}
                    onChange={(location) => setForm((p) => ({ ...p, location }))}
                    required
                  />
                </FormsLineSection>
                <FormsLineSection index={2} title="Choose the route">
                  <FormsLineChoicePicker
                    name="category"
                    label="Category"
                    value={form.category}
                    options={LEADS_CATEGORIES}
                    onChange={(category) => setForm((p) => ({ ...p, category }))}
                  />
                  <FormsLineChoicePicker
                    name="reason"
                    label="Reason"
                    value={form.reason}
                    options={LEADS_REASONS}
                    onChange={(reason) => setForm((p) => ({ ...p, reason }))}
                    dependent
                  />
                </FormsLineSection>
                {hasConditionalDetails && (
                  <FormsLineSection index={3} title="Conditional details">
                    {cond.needsSpecialRequest && (
                      <FormsLineControl id="special-request" label="Special request explanation" className="forms-line-field-full">
                        <textarea id="special-request" value={form.specialRequest} onChange={(e) => setForm((p) => ({ ...p, specialRequest: e.target.value }))} />
                      </FormsLineControl>
                    )}
                    {cond.needsLeadPackCode && (
                      <FormsLineControl id="lead-pack-code" label="Lead pack code">
                        <input id="lead-pack-code" value={form.leadPackCode} onChange={(e) => setForm((p) => ({ ...p, leadPackCode: e.target.value }))} />
                      </FormsLineControl>
                    )}
                    {(cond.needsHostile || cond.needsBlindKnock) && (
                      <FormsLineControl id="situation-description" label="Situation description" className="forms-line-field-full">
                        <textarea id="situation-description" value={form.situationDescription} onChange={(e) => setForm((p) => ({ ...p, situationDescription: e.target.value }))} />
                      </FormsLineControl>
                    )}
                    {cond.needsNewRep && (
                      <>
                        <FormsLineControl id="new-rep-phone" label="New-rep phone">
                          <input id="new-rep-phone" type="tel" value={form.newRepPhone} onChange={(e) => setForm((p) => ({ ...p, newRepPhone: e.target.value }))} />
                        </FormsLineControl>
                        <FormsLineControl id="new-rep-email" label="New-rep email">
                          <input id="new-rep-email" value={form.newRepEmail} onChange={(e) => setForm((p) => ({ ...p, newRepEmail: e.target.value }))} />
                        </FormsLineControl>
                      </>
                    )}
                  </FormsLineSection>
                )}
                {hasUploads && (
                  <FormsLineSection index={4} title="Proof">
                    {cond.needsHostile && (
                      <FormsLineControl id="hostile-attachment" label="Hostile attachment" className="forms-line-field-full">
                        <div className="forms-line-upload">
                          <FileUpload itemId="leads-request-hostile" accept="image/*,application/pdf" allowedTypes={FORM_ATTACHMENT_TYPES} uploadUrl="/api/portal/forms/upload" extraFields={{ formType: 'leads-request', slot: 'hostile' }} getHeaders={getHeaders} onUploaded={(path) => setForm((p) => ({ ...p, hostileUploadPath: path }))} />
                          <p className="forms-line-proof-hint">PNG, JPG, WEBP, HEIC, or PDF · 4 MB max.</p>
                        </div>
                      </FormsLineControl>
                    )}
                    {cond.needsBlindKnock && (
                      <FormsLineControl id="blind-knock-attachment" label="Blind-knock attachment" className="forms-line-field-full">
                        <div className="forms-line-upload">
                          <FileUpload itemId="leads-request-blind-knock" accept="image/*,application/pdf" allowedTypes={FORM_ATTACHMENT_TYPES} uploadUrl="/api/portal/forms/upload" extraFields={{ formType: 'leads-request', slot: 'blind-knock' }} getHeaders={getHeaders} onUploaded={(path) => setForm((p) => ({ ...p, blindKnockUploadPath: path }))} />
                          <p className="forms-line-proof-hint">PNG, JPG, WEBP, HEIC, or PDF · 4 MB max.</p>
                        </div>
                      </FormsLineControl>
                    )}
                    {cond.needsLasso && (
                      <FormsLineControl id="lasso-attachment" label="Lasso attachment" className="forms-line-field-full">
                        <div className="forms-line-upload">
                          <FileUpload itemId="leads-request-lasso" accept="image/*,application/pdf" allowedTypes={FORM_ATTACHMENT_TYPES} uploadUrl="/api/portal/forms/upload" extraFields={{ formType: 'leads-request', slot: 'lasso' }} getHeaders={getHeaders} onUploaded={(path) => setForm((p) => ({ ...p, lassoUploadPath: path }))} />
                          <p className="forms-line-proof-hint">PNG, JPG, WEBP, HEIC, or PDF · 4 MB max.</p>
                        </div>
                      </FormsLineControl>
                    )}
                  </FormsLineSection>
                )}
                <FormsLineActions verb="request" saving={saving} />
              </form>
              {referenceId && (
                <FormsLineSuccess
                  title="Request received"
                  referenceId={referenceId}
                  message="The lead request is in the review queue. The owner can follow up through the portal record."
                />
              )}
            </div>
            <FormsLineRail status="Ready for lead review" note="The selected route keeps the conditional handoff precise." />
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
