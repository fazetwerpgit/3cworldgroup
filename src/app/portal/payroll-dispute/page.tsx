'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import FileUpload from '@/components/onboarding/FileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PAYROLL_CAMPAIGNS } from '@/lib/forms/formOptions';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';

const EMPTY = {
  contractorName: '', contractorEmail: '', campaign: '',
  typeOfOrder: '', dateOfInstall: '', orderScreenshotPath: '',
};

export default function PayrollDisputePage() {
  const { user } = useAuth();
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
      const res = await fetch('/api/portal/forms/payroll-dispute', {
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
              <h1 className="text-2xl font-semibold text-slate-950">Payroll Dispute</h1>
              <p className="text-sm text-slate-600">Submitting as {user?.displayName || user?.email}.</p>
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Dispute submitted.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>Contractor Name</Label><Input value={form.contractorName} onChange={(e) => setForm((p) => ({ ...p, contractorName: e.target.value }))} required /></div>
                <div><Label>Contractor Email</Label><Input value={form.contractorEmail} onChange={(e) => setForm((p) => ({ ...p, contractorEmail: e.target.value }))} required /></div>
                <div>
                  <Label>Campaign</Label>
                  <NativeSelect value={form.campaign} onChange={(e) => setForm((p) => ({ ...p, campaign: e.target.value }))} className="w-full" required>
                    <NativeSelectOption value="">Select campaign</NativeSelectOption>
                    {PAYROLL_CAMPAIGNS.map((c) => (
                      <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div><Label>Type of Order</Label><Input value={form.typeOfOrder} onChange={(e) => setForm((p) => ({ ...p, typeOfOrder: e.target.value }))} required /></div>
                <div><Label>Date of Install</Label><Input value={form.dateOfInstall} onChange={(e) => setForm((p) => ({ ...p, dateOfInstall: e.target.value }))} placeholder="MM/DD/YYYY" required /></div>
                <div className="sm:col-span-2">
                  <Label>Screenshot of Order</Label>
                  <FileUpload
                    itemId="payroll-dispute"
                    accept="image/*,application/pdf"
                    allowedTypes={FORM_ATTACHMENT_TYPES}
                    uploadUrl="/api/portal/forms/upload"
                    extraFields={{ formType: 'payroll-dispute' }}
                    getHeaders={async (): Promise<HeadersInit> => {
                      const t = await auth?.currentUser?.getIdToken();
                      return t ? { Authorization: `Bearer ${t}` } : {};
                    }}
                    onUploaded={(path) => setForm((p) => ({ ...p, orderScreenshotPath: path }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    {saving ? 'Submitting…' : 'Submit Dispute'}
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
