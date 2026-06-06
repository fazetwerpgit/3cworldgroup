'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { CommissionConfig, FieldRole, RoleDisplayNames } from '@/types';

interface PayStructureResponse {
  tiers: CommissionConfig[];
  scope: 'own' | 'all';
  updatedAt: string | null;
  updatedByName: string | null;
}

// Per-tier blurb shown under the role name
const TIER_NOTES: Record<FieldRole, string> = {
  entry_rep: 'Commission on your own approved sales.',
  l1_manager: 'Commission on your own sales plus an override on your team.',
  l2_manager: 'Commission on your own sales plus an override on your organization.',
};

export default function PayStructurePage() {
  const { user, isRole } = useAuth();
  const [data, setData] = useState<PayStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Admin edit state
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
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load pay structure');
      }
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
    (t) => t.baseRate === 0 && (t.overrideRate ?? 0) === 0
  );

  const updateDraft = (
    fieldRole: FieldRole,
    key: 'baseRate' | 'overrideRate',
    value: string
  ) => {
    setDraft((prev) =>
      prev.map((t) =>
        t.fieldRole === fieldRole ? { ...t, [key]: Number(value) || 0 } : t
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
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save');
      }
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0A1F44]">Pay Structure</h1>
                  <p className="text-gray-500 mt-1">
                    {data?.scope === 'all'
                      ? 'Commission tiers for every field role'
                      : 'Your commission tier'}
                  </p>
                </div>
                {isAdmin && data && !editing && (
                  <button
                    onClick={() => {
                      setDraft(data.tiers);
                      setEditing(true);
                    }}
                    className="px-4 py-2 bg-[#0A1F44] text-white rounded-lg text-sm font-medium hover:bg-[#13294f] transition-colors"
                  >
                    Edit Rates
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm border border-green-200">
                  {success}
                </div>
              )}

              {ratesPending && !loading && (
                <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded-xl text-sm border border-yellow-200">
                  Final commission rates are being confirmed by leadership. The
                  numbers below are placeholders and will be updated.
                </div>
              )}

              {loading ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading pay structure...</p>
                </div>
              ) : (
                (editing ? draft : data?.tiers ?? []).map((tier) => (
                  <div
                    key={tier.fieldRole}
                    className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-semibold text-gray-900">
                        {RoleDisplayNames[tier.fieldRole]}
                      </h2>
                      {data?.scope === 'own' && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#8dc63f]/10 text-[#5a8f1f]">
                          Your tier
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      {TIER_NOTES[tier.fieldRole]}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                          Base Commission
                        </p>
                        {editing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={tier.baseRate}
                            onChange={(e) =>
                              updateDraft(tier.fieldRole, 'baseRate', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
                            aria-label={`Base rate for ${RoleDisplayNames[tier.fieldRole]}`}
                          />
                        ) : (
                          <p className="text-2xl font-bold text-[#0A1F44]">
                            {tier.baseRate}%
                          </p>
                        )}
                      </div>
                      {tier.overrideRate !== undefined && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                            Team Override
                          </p>
                          {editing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={tier.overrideRate}
                              onChange={(e) =>
                                updateDraft(tier.fieldRole, 'overrideRate', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
                              aria-label={`Override rate for ${RoleDisplayNames[tier.fieldRole]}`}
                            />
                          ) : (
                            <p className="text-2xl font-bold text-[#0A1F44]">
                              {tier.overrideRate}%
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {tier.notes && !editing && (
                      <p className="text-sm text-gray-500 mt-3">{tier.notes}</p>
                    )}
                  </div>
                ))
              )}

              {editing && (
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setDraft(data?.tiers ?? []);
                    }}
                    disabled={saving}
                    className="px-4 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-[#8dc63f] text-white rounded-lg text-sm font-medium hover:bg-[#7ab82e] disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Rates'}
                  </button>
                </div>
              )}

              {data?.updatedAt && (
                <p className="text-xs text-gray-400">
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
