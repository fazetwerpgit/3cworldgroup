'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { AlertCircle, BadgeDollarSign, Clock3, Edit3, Layers3, Save, Users } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CommissionConfig, FieldRole, RoleDisplayNames } from '@/types';

interface PayStructureResponse {
  tiers: CommissionConfig[];
  scope: 'own' | 'all';
  updatedAt: string | null;
  updatedByName: string | null;
}

const TIER_NOTES: Record<FieldRole, string> = {
  entry_rep: 'Commission on your own approved sales.',
  l1_manager: 'Commission on your own sales plus an override on your team.',
  l2_manager: 'Commission on your own sales plus an override on your organization.',
};

const TIER_ICON: Record<FieldRole, ElementType> = {
  entry_rep: BadgeDollarSign,
  l1_manager: Users,
  l2_manager: Layers3,
};

export default function PayStructurePage() {
  const { user, isRole } = useAuth();
  const [data, setData] = useState<PayStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CommissionConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const isAdmin = isRole('admin');

  const fetchStructure = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/commission?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pay structure');
      setData(json);
      setDraft(json.tiers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pay structure');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStructure();
  }, [fetchStructure]);

  const ratesPending = (data?.tiers ?? []).every(
    (tier) => tier.baseRate === 0 && (tier.overrideRate ?? 0) === 0
  );

  const updateDraft = (
    fieldRole: FieldRole,
    key: 'baseRate' | 'overrideRate',
    value: string
  ) => {
    setDraft((prev) =>
      prev.map((tier) =>
        tier.fieldRole === fieldRole ? { ...tier, [key]: Number(value) || 0 } : tier
      )
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/portal/commission', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: draft,
          updatedBy: user.uid,
          updatedByName: user.displayName || user.email,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to save');
      setEditing(false);
      setSuccess('Pay structure updated');
      setTimeout(() => setSuccess(''), 3000);
      await fetchStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const tiers = editing ? draft : data?.tiers ?? [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                        Pay Structure
                      </h1>
                      <Badge variant="outline" className="rounded-md border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1d] dark:text-green-300">
                        Compensation
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                      {data?.scope === 'all'
                        ? 'Commission tiers for every field role.'
                        : 'Your current commission tier and override rules.'}
                    </p>
                  </div>
                  {isAdmin && data && !editing && (
                    <Button
                      onClick={() => {
                        setDraft(data.tiers);
                        setEditing(true);
                      }}
                      className="bg-[#0A1F44] text-white hover:bg-[#13294f]"
                    >
                      <Edit3 className="size-4" />
                      Edit Rates
                    </Button>
                  )}
                </div>
              </section>

              {error && (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Save className="size-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
              {ratesPending && !loading && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                  <Clock3 className="size-4" />
                  <AlertDescription>
                    Final commission rates are being confirmed by leadership. Current numbers are placeholders.
                  </AlertDescription>
                </Alert>
              )}

              {loading ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {[1, 2, 3].map((item) => (
                    <Card key={item} className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                      <CardContent className="space-y-4 p-5">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {tiers.map((tier) => {
                    const TierIcon = TIER_ICON[tier.fieldRole];
                    return (
                      <Card
                        key={tier.fieldRole}
                        className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/60 hover:shadow-md motion-reduce:transform-none"
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex gap-3">
                              <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                                <TierIcon className="size-5" />
                              </div>
                              <div>
                                <CardTitle className="text-base text-slate-950 dark:text-foreground">
                                  {RoleDisplayNames[tier.fieldRole]}
                                </CardTitle>
                                <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
                                  {TIER_NOTES[tier.fieldRole]}
                                </p>
                              </div>
                            </div>
                            {data?.scope === 'own' && (
                              <Badge className="bg-[#8dc63f]/15 text-[#4f7f1d] dark:text-green-300 hover:bg-[#8dc63f]/15">
                                Your tier
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-muted-foreground">
                              Base Commission
                            </p>
                            {editing ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.5"
                                value={tier.baseRate}
                                onChange={(event) =>
                                  updateDraft(tier.fieldRole, 'baseRate', event.target.value)
                                }
                                className="mt-2 bg-white dark:bg-card dark:text-foreground"
                                aria-label={`Base rate for ${RoleDisplayNames[tier.fieldRole]}`}
                              />
                            ) : (
                              <p className="mt-2 text-3xl font-semibold text-[#0A1F44] dark:text-foreground">
                                {tier.baseRate}%
                              </p>
                            )}
                          </div>
                          {tier.overrideRate !== undefined && (
                            <div className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-muted-foreground">
                                Team Override
                              </p>
                              {editing ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={tier.overrideRate}
                                  onChange={(event) =>
                                    updateDraft(tier.fieldRole, 'overrideRate', event.target.value)
                                  }
                                  className="mt-2"
                                  aria-label={`Override rate for ${RoleDisplayNames[tier.fieldRole]}`}
                                />
                              ) : (
                                <p className="mt-2 text-2xl font-semibold text-[#0A1F44] dark:text-foreground">
                                  {tier.overrideRate}%
                                </p>
                              )}
                            </div>
                          )}
                          {tier.notes && !editing && (
                            <p className="text-sm text-slate-500 dark:text-muted-foreground">{tier.notes}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {editing && (
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setDraft(data?.tiers ?? []);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                  >
                    {saving ? 'Saving...' : 'Save Rates'}
                  </Button>
                </div>
              )}

              {data?.updatedAt && (
                <p className="text-xs text-slate-500 dark:text-muted-foreground">
                  Last updated{' '}
                  {new Date(data.updatedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {data.updatedByName ? ` by ${data.updatedByName}` : ''}
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
