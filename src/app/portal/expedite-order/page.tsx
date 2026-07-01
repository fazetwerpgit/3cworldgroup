'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { US_STATES } from '@/lib/validation/address';

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
  const [done, setDone] = useState(false);
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
      setDone(true);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-2xl space-y-5">
              <h1 className="text-2xl font-semibold text-slate-950 dark:text-foreground">Expedite Internet Order</h1>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">Submitting as {user?.displayName || user?.email}.</p>
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Expedite request submitted.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">{error}</div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>Customer Name</Label><Input value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} required /></div>
                <div><Label>Customer Phone</Label><Input value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} required /></div>
                <div className="sm:col-span-2"><Label>Customer Email</Label><Input value={form.customerEmail} onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label>Street Address</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
                <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
                <div>
                  <Label>State</Label>
                  <NativeSelect value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="w-full">
                    <NativeSelectOption value="">Select state</NativeSelectOption>
                    {US_STATES.map((st) => (
                      <NativeSelectOption key={st.code} value={st.code}>{st.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} placeholder="12345" /></div>
                <div><Label>Order Number</Label><Input value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} required /></div>
                <div className="sm:col-span-2"><Label>Desired expedite dates</Label><Textarea value={form.expediteDates} onChange={(e) => setForm((p) => ({ ...p, expediteDates: e.target.value }))} required /></div>
                <div className="sm:col-span-2">
                  <Label>Reason for expedite</Label>
                  <NativeSelect value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="w-full" required>
                    <NativeSelectOption value="">Select reason</NativeSelectOption>
                    {options.expediteReasons.map((r) => (
                      <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    {saving ? 'Submitting…' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
