'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import SignaturePad from '@/components/forms/SignaturePad';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useFormOptions } from '@/hooks/useFormOptions';
import { isPromotionRole } from '@/lib/forms/managerInterview';

const EMPTY = {
  provider: '',
  jobPosition: '',
  hiringManager: '',
  hiringManagerEmail: '',
  candidateFirstName: '',
  candidateLastName: '',
  candidateEmail: '',
  market: '',
  didShow: false,
  extendOffer: false,
  rating: 1,
  completedProduction: false,
  completedReading: false,
  completedTeamMetric: false,
  signatureDataUrl: '',
};

export default function ManagerInterviewPage() {
  const { user } = useAuth();
  const { options } = useFormOptions();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
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
      setDone(true);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute
      roles={[
        'admin',
        'operations',
        'l1_manager',
        'l2_manager',
        'ibo_level_1',
        'ibo_level_2',
        'ibo_level_3',
        'ibo_level_4',
      ]}
    >
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1100px] space-y-5">
              <PortalPageHeader
                eyebrow="Field forms"
                title="Manager Final Interview"
                description="Record a candidate's final interview outcome and rating."
              />
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Interview submitted.
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
                      <Label>Provider</Label>
                      <NativeSelect value={form.provider} onChange={(e) => setForm((p) => ({ ...p, provider: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select provider</NativeSelectOption>
                        {options.providers.map((provider) => (
                          <NativeSelectOption key={provider} value={provider}>{provider}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Job Position</Label>
                      <NativeSelect value={form.jobPosition} onChange={(e) => setForm((p) => ({ ...p, jobPosition: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select job position</NativeSelectOption>
                        {options.hireJobPositions.map((position) => (
                          <NativeSelectOption key={position} value={position}>{position}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Hiring Manager</Label>
                      <NativeSelect value={form.hiringManager} onChange={(e) => setForm((p) => ({ ...p, hiringManager: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select hiring manager</NativeSelectOption>
                        {options.hireManagers.map((manager) => (
                          <NativeSelectOption key={manager} value={manager}>{manager}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>Hiring Manager Email</Label>
                      <Input type="email" value={form.hiringManagerEmail} onChange={(e) => setForm((p) => ({ ...p, hiringManagerEmail: e.target.value }))} required />
                    </div>
                    <div>
                      <Label>Candidate First Name</Label>
                      <Input value={form.candidateFirstName} onChange={(e) => setForm((p) => ({ ...p, candidateFirstName: e.target.value }))} required />
                    </div>
                    <div>
                      <Label>Candidate Last Name</Label>
                      <Input value={form.candidateLastName} onChange={(e) => setForm((p) => ({ ...p, candidateLastName: e.target.value }))} required />
                    </div>
                    <div>
                      <Label>Candidate Email</Label>
                      <Input type="email" value={form.candidateEmail} onChange={(e) => setForm((p) => ({ ...p, candidateEmail: e.target.value }))} required />
                    </div>
                    <div>
                      <Label>Market</Label>
                      <NativeSelect value={form.market} onChange={(e) => setForm((p) => ({ ...p, market: e.target.value }))} className="w-full" required>
                        <NativeSelectOption value="">Select market</NativeSelectOption>
                        {options.hireMarkets.map((market) => (
                          <NativeSelectOption key={market} value={market}>{market}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {options.hireMarkets.length === 0 && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">No markets configured yet — an admin can add them in Form Options.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                      <div>
                        <Label>Did Candidate Show?</Label>
                        <NativeSelect value={form.didShow ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, didShow: e.target.value === 'yes' }))} className="w-full">
                          <NativeSelectOption value="no">No</NativeSelectOption>
                          <NativeSelectOption value="yes">Yes</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div>
                        <Label>Extend Offer?</Label>
                        <NativeSelect value={form.extendOffer ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, extendOffer: e.target.value === 'yes' }))} className="w-full">
                          <NativeSelectOption value="no">No</NativeSelectOption>
                          <NativeSelectOption value="yes">Yes</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div>
                        <Label>Rate Candidate</Label>
                        <NativeSelect value={String(form.rating)} onChange={(e) => setForm((p) => ({ ...p, rating: Number(e.target.value) }))} className="w-full" required>
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <NativeSelectOption key={rating} value={rating}>{rating}</NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>
                    {promo && (
                      <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                        <div>
                          <Label>For Promotion Only: Completed Production?</Label>
                          <NativeSelect value={form.completedProduction ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, completedProduction: e.target.value === 'yes' }))} className="w-full">
                            <NativeSelectOption value="no">No</NativeSelectOption>
                            <NativeSelectOption value="yes">Yes</NativeSelectOption>
                          </NativeSelect>
                        </div>
                        <div>
                          <Label>For Promotion Only: Completed Reading?</Label>
                          <NativeSelect value={form.completedReading ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, completedReading: e.target.value === 'yes' }))} className="w-full">
                            <NativeSelectOption value="no">No</NativeSelectOption>
                            <NativeSelectOption value="yes">Yes</NativeSelectOption>
                          </NativeSelect>
                        </div>
                        <div>
                          <Label>For Promotion Only: Completed Team Metric?</Label>
                          <NativeSelect value={form.completedTeamMetric ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, completedTeamMetric: e.target.value === 'yes' }))} className="w-full">
                            <NativeSelectOption value="no">No</NativeSelectOption>
                            <NativeSelectOption value="yes">Yes</NativeSelectOption>
                          </NativeSelect>
                        </div>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <Label>Manager Signature For Approval</Label>
                      <SignaturePad onChange={(d) => setForm((p) => ({ ...p, signatureDataUrl: d ?? '' }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={saving || !form.signatureDataUrl} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                        {saving ? 'Submitting…' : 'Submit Interview'}
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
