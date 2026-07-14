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
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

const EMPTY = {
  companySold: '', dateKnocked: '', packNumber: '', numberOfReps: '',
  doorsKnocked: '', customerContacts: '', numberOfSales: '', orderNumber: '',
};

export default function FiberReportPage() {
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

  const displayName = user?.displayName || user?.email || 'current user';
  const role = getEffectiveRole(user);
  const roleLabel = role ? RoleDisplayNames[role] : 'Portal user';

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <section className="forms-line-fill" aria-labelledby="fiber-report-title">
          <FormsLineFormHeader title="Fiber Report" lane="01" />
          {error && <FormsLineAlert kind="error">{error}</FormsLineAlert>}
          <div className="forms-line-fill-body">
            <div>
              <form onSubmit={submit}>
                <FormsLineSection
                  index={1}
                  title="What happened"
                  identity={<FormsLineIdentity name={displayName} role={roleLabel} />}
                >
                  <FormsLineChoicePicker
                    name="companySold"
                    label="Company sold"
                    value={form.companySold}
                    options={options.providers}
                    onChange={(companySold) => setForm((p) => ({ ...p, companySold }))}
                  />
                  <FormsLineControl id="date-knocked" label="Date knocked">
                    <input id="date-knocked" value={form.dateKnocked} onChange={(e) => setForm((p) => ({ ...p, dateKnocked: e.target.value }))} placeholder="MM/DD/YYYY" />
                  </FormsLineControl>
                  <FormsLineControl id="pack-number" label="Pack number">
                    <input id="pack-number" value={form.packNumber} onChange={(e) => setForm((p) => ({ ...p, packNumber: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="number-of-reps" label="Number of reps">
                    <input id="number-of-reps" inputMode="numeric" value={form.numberOfReps} onChange={(e) => setForm((p) => ({ ...p, numberOfReps: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="doors-knocked" label="Doors knocked">
                    <input id="doors-knocked" inputMode="numeric" value={form.doorsKnocked} onChange={(e) => setForm((p) => ({ ...p, doorsKnocked: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="customer-contacts" label="Customer contacts">
                    <input id="customer-contacts" inputMode="numeric" value={form.customerContacts} onChange={(e) => setForm((p) => ({ ...p, customerContacts: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="number-of-sales" label="# of sales">
                    <input id="number-of-sales" inputMode="numeric" value={form.numberOfSales} onChange={(e) => setForm((p) => ({ ...p, numberOfSales: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="order-number" label="Order number" className="forms-line-field-full">
                    <input id="order-number" value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} />
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineActions verb="report" saving={saving} />
              </form>
              {referenceId && (
                <FormsLineSuccess
                  title="Report received"
                  referenceId={referenceId}
                  message="Your fiber activity is in the review queue. The team can follow up through the portal record."
                />
              )}
            </div>
            <FormsLineRail status="Ready for field review" note="Keep the pack activity clear and easy to verify." />
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
