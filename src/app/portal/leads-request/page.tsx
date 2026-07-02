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
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import FileUpload from '@/components/onboarding/FileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import {
  LEADS_CATEGORIES,
  LEADS_REASONS,
} from '@/lib/forms/formOptions';
import { leadsConditions } from '@/lib/forms/leadsPredicates';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';

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
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const cond = leadsConditions({ category: form.category, reason: form.reason, location: form.location });

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
      setDone(true);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  const getHeaders = async (): Promise<HeadersInit> => {
    const t = await auth?.currentUser?.getIdToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
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
                title="Leads Request"
                description="Request lead packs or flag rep and territory issues."
              />
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Request submitted.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">{error}</div>
              )}
              <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
                <CardContent className="p-5 sm:p-6">
                  <p className="mb-4 text-xs text-slate-500 dark:text-muted-foreground">Submitting as {user?.displayName || user?.email}.</p>
                  <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Campaign</Label>
                      <NativeSelect value={form.campaign} onChange={(e) => setForm((p) => ({ ...p, campaign: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select campaign</NativeSelectOption>
                        {options.leadsCampaigns.map((c) => (
                          <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Manager Name</Label>
                      <NativeSelect value={form.managerName} onChange={(e) => setForm((p) => ({ ...p, managerName: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select manager</NativeSelectOption>
                        {options.leadsManagers.map((m) => (
                          <NativeSelectOption key={m} value={m}>{m}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div><Label>Manager Email</Label><Input value={form.managerEmail} onChange={(e) => setForm((p) => ({ ...p, managerEmail: e.target.value }))} required /></div>
                    <div><Label>Rep First Name</Label><Input value={form.repFirstName} onChange={(e) => setForm((p) => ({ ...p, repFirstName: e.target.value }))} required /></div>
                    <div><Label>Rep Last Name</Label><Input value={form.repLastName} onChange={(e) => setForm((p) => ({ ...p, repLastName: e.target.value }))} required /></div>
                    <div>
                      <Label>Location</Label>
                      <NativeSelect value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select location</NativeSelectOption>
                        {options.leadsLocations.map((l) => (
                          <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Category</Label>
                      <NativeSelect value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full">
                        <NativeSelectOption value="">Select…</NativeSelectOption>
                        {LEADS_CATEGORIES.map((c) => (
                          <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <NativeSelect value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="w-full">
                        <NativeSelectOption value="">Select…</NativeSelectOption>
                        {LEADS_REASONS.map((r) => (
                          <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>

                    {cond.needsSpecialRequest && (
                      <div className="sm:col-span-2">
                        <Label>Special Request Explanation</Label>
                        <Textarea value={form.specialRequest} onChange={(e) => setForm((p) => ({ ...p, specialRequest: e.target.value }))} />
                      </div>
                    )}
                    {cond.needsLeadPackCode && (
                      <div><Label>Lead Pack Code</Label><Input value={form.leadPackCode} onChange={(e) => setForm((p) => ({ ...p, leadPackCode: e.target.value }))} /></div>
                    )}
                    {(cond.needsHostile || cond.needsBlindKnock) && (
                      <div className="sm:col-span-2">
                        <Label>Situation Description</Label>
                        <Textarea value={form.situationDescription} onChange={(e) => setForm((p) => ({ ...p, situationDescription: e.target.value }))} />
                      </div>
                    )}
                    {cond.needsHostile && (
                      <div className="sm:col-span-2">
                        <Label>Hostile Attachment</Label>
                        <FileUpload
                          itemId="leads-request-hostile"
                          accept="image/*,application/pdf"
                          allowedTypes={FORM_ATTACHMENT_TYPES}
                          uploadUrl="/api/portal/forms/upload"
                          extraFields={{ formType: 'leads-request', slot: 'hostile' }}
                          getHeaders={getHeaders}
                          onUploaded={(path) => setForm((p) => ({ ...p, hostileUploadPath: path }))}
                        />
                      </div>
                    )}
                    {cond.needsBlindKnock && (
                      <div className="sm:col-span-2">
                        <Label>Blind-Knock Attachment</Label>
                        <FileUpload
                          itemId="leads-request-blind-knock"
                          accept="image/*,application/pdf"
                          allowedTypes={FORM_ATTACHMENT_TYPES}
                          uploadUrl="/api/portal/forms/upload"
                          extraFields={{ formType: 'leads-request', slot: 'blind-knock' }}
                          getHeaders={getHeaders}
                          onUploaded={(path) => setForm((p) => ({ ...p, blindKnockUploadPath: path }))}
                        />
                      </div>
                    )}
                    {cond.needsLasso && (
                      <div className="sm:col-span-2">
                        <Label>Lasso Attachment</Label>
                        <FileUpload
                          itemId="leads-request-lasso"
                          accept="image/*,application/pdf"
                          allowedTypes={FORM_ATTACHMENT_TYPES}
                          uploadUrl="/api/portal/forms/upload"
                          extraFields={{ formType: 'leads-request', slot: 'lasso' }}
                          getHeaders={getHeaders}
                          onUploaded={(path) => setForm((p) => ({ ...p, lassoUploadPath: path }))}
                        />
                      </div>
                    )}
                    {cond.needsNewRep && (
                      <>
                        <div><Label>New-Rep Phone</Label><Input value={form.newRepPhone} onChange={(e) => setForm((p) => ({ ...p, newRepPhone: e.target.value }))} /></div>
                        <div><Label>New-Rep Email</Label><Input value={form.newRepEmail} onChange={(e) => setForm((p) => ({ ...p, newRepEmail: e.target.value }))} /></div>
                      </>
                    )}

                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                        {saving ? 'Submitting…' : 'Submit Request'}
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
