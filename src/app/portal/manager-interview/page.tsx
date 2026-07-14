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
import SignaturePad from '@/components/forms/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { isPromotionRole } from '@/lib/forms/managerInterview';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

const EMPTY = {
  provider: '', jobPosition: '', hiringManager: '', hiringManagerEmail: '',
  candidateFirstName: '', candidateLastName: '', candidateEmail: '', market: '',
  didShow: false, extendOffer: false, rating: 1,
  completedProduction: false, completedReading: false, completedTeamMetric: false,
  signatureDataUrl: '',
};

const managerInterviewRoles = [
  'admin',
  'operations',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
] as const;

export default function ManagerInterviewPage() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [error, setError] = useState('');

  const promo = isPromotionRole(form.jobPosition);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
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
    <ProtectedRoute roles={[...managerInterviewRoles]}>
      <FormsLineShell>
        <section className="forms-line-fill" aria-labelledby="manager-interview-title">
          <FormsLineFormHeader title="Manager Interview" lane="05" />
          {error && <FormsLineAlert kind="error">{error}</FormsLineAlert>}
          <div className="forms-line-fill-body">
            <div>
              <form onSubmit={submit}>
                <FormsLineSection
                  index={1}
                  title="The interview"
                  identity={<FormsLineIdentity name={displayName} role={roleLabel} />}
                >
                  <FormsLineChoicePicker
                    name="provider"
                    label="Provider"
                    value={form.provider}
                    options={options.providers}
                    onChange={(provider) => setForm((p) => ({ ...p, provider }))}
                    required
                  />
                  <FormsLineChoicePicker
                    name="jobPosition"
                    label="Job position"
                    value={form.jobPosition}
                    options={options.hireJobPositions}
                    onChange={(jobPosition) => setForm((p) => ({ ...p, jobPosition }))}
                    required
                  />
                  <FormsLineChoicePicker
                    name="hiringManager"
                    label="Hiring manager"
                    value={form.hiringManager}
                    options={options.hireManagers}
                    onChange={(hiringManager) => setForm((p) => ({ ...p, hiringManager }))}
                    required
                  />
                  <FormsLineControl id="hiring-manager-email" label="Hiring manager email" required>
                    <input id="hiring-manager-email" type="email" value={form.hiringManagerEmail} onChange={(e) => setForm((p) => ({ ...p, hiringManagerEmail: e.target.value }))} required />
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineSection index={2} title="Candidate decision">
                  <FormsLineControl id="candidate-first-name" label="Candidate first name" required>
                    <input id="candidate-first-name" value={form.candidateFirstName} onChange={(e) => setForm((p) => ({ ...p, candidateFirstName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="candidate-last-name" label="Candidate last name" required>
                    <input id="candidate-last-name" value={form.candidateLastName} onChange={(e) => setForm((p) => ({ ...p, candidateLastName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="candidate-email" label="Candidate email" required>
                    <input id="candidate-email" type="email" value={form.candidateEmail} onChange={(e) => setForm((p) => ({ ...p, candidateEmail: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineChoicePicker
                    name="market"
                    label="Market"
                    value={form.market}
                    options={options.hireMarkets}
                    onChange={(market) => setForm((p) => ({ ...p, market }))}
                    required
                    emptyMessage="No markets configured yet — an admin can add them in Form Options."
                  />
                  <FormsLineChoicePicker
                    name="didShow"
                    label="Did candidate show?"
                    value={form.didShow ? 'Yes' : 'No'}
                    options={['No', 'Yes']}
                    onChange={(value) => setForm((p) => ({ ...p, didShow: value === 'Yes' }))}
                    required
                  />
                  <FormsLineChoicePicker
                    name="extendOffer"
                    label="Extend offer?"
                    value={form.extendOffer ? 'Yes' : 'No'}
                    options={['No', 'Yes']}
                    onChange={(value) => setForm((p) => ({ ...p, extendOffer: value === 'Yes' }))}
                    required
                  />
                  <FormsLineChoicePicker
                    name="rating"
                    label="Rate candidate"
                    value={String(form.rating)}
                    options={['1', '2', '3', '4', '5']}
                    onChange={(value) => setForm((p) => ({ ...p, rating: Number(value) }))}
                    required
                  />
                  {promo && (
                    <>
                      <FormsLineChoicePicker name="completedProduction" label="Promotion / completed production?" value={form.completedProduction ? 'Yes' : 'No'} options={['No', 'Yes']} onChange={(value) => setForm((p) => ({ ...p, completedProduction: value === 'Yes' }))} />
                      <FormsLineChoicePicker name="completedReading" label="Promotion / completed reading?" value={form.completedReading ? 'Yes' : 'No'} options={['No', 'Yes']} onChange={(value) => setForm((p) => ({ ...p, completedReading: value === 'Yes' }))} />
                      <FormsLineChoicePicker name="completedTeamMetric" label="Promotion / completed team metric?" value={form.completedTeamMetric ? 'Yes' : 'No'} options={['No', 'Yes']} onChange={(value) => setForm((p) => ({ ...p, completedTeamMetric: value === 'Yes' }))} />
                    </>
                  )}
                </FormsLineSection>
                <FormsLineSection index={3} title="Signature">
                  <FormsLineControl id="manager-signature" label="Manager signature for approval" className="forms-line-field-full">
                    <div className="forms-line-signature">
                      <SignaturePad onChange={(dataUrl) => setForm((p) => ({ ...p, signatureDataUrl: dataUrl ?? '' }))} />
                    </div>
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineActions verb="interview" saving={saving} disabled={!form.signatureDataUrl} />
              </form>
              {referenceId && (
                <FormsLineSuccess
                  title="Interview received"
                  referenceId={referenceId}
                  message="The interview decision and signature are in the review queue."
                />
              )}
            </div>
            <FormsLineRail status="Ready for manager review" note="A complete signature closes the final interview handoff." />
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
