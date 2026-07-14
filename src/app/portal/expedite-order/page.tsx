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
import { US_STATES } from '@/lib/validation/address';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

const EMPTY = {
  customerName: '', customerPhone: '', customerEmail: '',
  address: '', city: '', state: '', zip: '',
  orderNumber: '', expediteDates: '', reason: '',
};

export default function ExpediteOrderPage() {
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

  const displayName = user?.displayName || user?.email || 'current user';
  const role = getEffectiveRole(user);
  const roleLabel = role ? RoleDisplayNames[role] : 'Portal user';

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <section className="forms-line-fill" aria-labelledby="expedite-order-title">
          <FormsLineFormHeader title="Expedite Order" lane="02" />
          {error && <FormsLineAlert kind="error">{error}</FormsLineAlert>}
          <div className="forms-line-fill-body">
            <div>
              <form onSubmit={submit}>
                <FormsLineSection
                  index={1}
                  title="Who you are"
                  identity={<FormsLineIdentity name={displayName} role={roleLabel} />}
                >
                  <FormsLineControl id="customer-name" label="Customer name" required>
                    <input id="customer-name" value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="customer-phone" label="Customer phone" required>
                    <input id="customer-phone" type="tel" value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="customer-email" label="Customer email" className="forms-line-field-full">
                    <input id="customer-email" value={form.customerEmail} onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))} />
                  </FormsLineControl>
                </FormsLineSection>
                <FormsLineSection index={2} title="Where it goes">
                  <FormsLineControl id="address" label="Street address" className="forms-line-field-full">
                    <input id="address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="city" label="City">
                    <input id="city" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="state" label="State">
                    <select id="state" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}>
                      <option value="">Select state</option>
                      {US_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                    </select>
                  </FormsLineControl>
                  <FormsLineControl id="zip" label="ZIP">
                    <input id="zip" inputMode="numeric" placeholder="12345" value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} />
                  </FormsLineControl>
                  <FormsLineControl id="order-number" label="Order number" required>
                    <input id="order-number" value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineControl id="expedite-dates" label="Desired expedite dates" required className="forms-line-field-full">
                    <textarea id="expedite-dates" maxLength={300} value={form.expediteDates} onChange={(e) => setForm((p) => ({ ...p, expediteDates: e.target.value }))} required />
                  </FormsLineControl>
                  <FormsLineChoicePicker
                    name="reason"
                    label="Reason for expedite"
                    value={form.reason}
                    options={options.expediteReasons}
                    onChange={(reason) => setForm((p) => ({ ...p, reason }))}
                    required
                  />
                </FormsLineSection>
                <FormsLineActions verb="order" saving={saving} />
              </form>
              {referenceId && (
                <FormsLineSuccess
                  title="Request received"
                  referenceId={referenceId}
                  message="The expedite request is in the review queue. The owner can follow up through the portal record."
                />
              )}
            </div>
            <FormsLineRail status="Ready for order review" note="A clear timeline gives the install owner a clean handoff." />
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
