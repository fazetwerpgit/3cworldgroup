'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';

const EMPTY = {
  companySold: '', dateKnocked: '', packNumber: '', numberOfReps: '',
  doorsKnocked: '', customerContacts: '', numberOfSales: '', orderNumber: '',
};

export default function FiberReportPage() {
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
      const res = await fetch('/api/portal/forms/fiber-report', {
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
            <div className="mx-auto max-w-[1100px] space-y-5">
              <PortalPageHeader
                eyebrow="Field forms"
                title="New Fiber Report"
                description="Log door-knocking activity and fiber sales for a pack."
              />
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Report submitted. Thank you!
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">{error}</div>
              )}
              <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
                <CardContent className="p-5 sm:p-6">
                  <p className="mb-4 text-xs text-slate-500 dark:text-muted-foreground">
                    Submitting as {user?.displayName || user?.email}.
                  </p>
                  <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Company Sold</Label>
                      <NativeSelect
                        value={form.companySold}
                        onChange={(e) => setForm((p) => ({ ...p, companySold: e.target.value }))}
                        className="w-full"
                      >
                        <NativeSelectOption value="">Select company</NativeSelectOption>
                        {options.providers.map((c) => (
                          <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div><Label>Date Knocked</Label><Input value={form.dateKnocked} onChange={(e) => setForm((p) => ({ ...p, dateKnocked: e.target.value }))} placeholder="MM/DD/YYYY" /></div>
                    <div><Label>Pack Number</Label><Input value={form.packNumber} onChange={(e) => setForm((p) => ({ ...p, packNumber: e.target.value }))} /></div>
                    <div><Label>Number of Reps</Label><Input value={form.numberOfReps} onChange={(e) => setForm((p) => ({ ...p, numberOfReps: e.target.value }))} inputMode="numeric" /></div>
                    <div><Label>Doors Knocked</Label><Input value={form.doorsKnocked} onChange={(e) => setForm((p) => ({ ...p, doorsKnocked: e.target.value }))} inputMode="numeric" /></div>
                    <div><Label>Customer Contacts</Label><Input value={form.customerContacts} onChange={(e) => setForm((p) => ({ ...p, customerContacts: e.target.value }))} inputMode="numeric" /></div>
                    <div><Label># of Sales</Label><Input value={form.numberOfSales} onChange={(e) => setForm((p) => ({ ...p, numberOfSales: e.target.value }))} inputMode="numeric" /></div>
                    <div className="sm:col-span-2"><Label>Order Number</Label><Input value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} /></div>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                        {saving ? 'Submitting…' : 'Submit Report'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
