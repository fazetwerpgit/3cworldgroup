'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Edit3, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  COMP_PLAN_ROLES,
  CompPlanMargin,
  CompPlanRates,
  CompPlanRole,
  FIBER_COMPANIES,
  FIBER_PLANS,
  RoleDisplayNames,
} from '@/types';

// Column headers: the full role names would make a 14-column table unreadable,
// so the header carries the short form and the title attribute the full one.
const ROLE_SHORT: Record<CompPlanRole, string> = {
  ae_tier_1: 'AE T1',
  ae_tier_2: 'AE T2',
  gm_in_training: 'GM Trn',
  general_manager: 'GM',
  office_manager: 'Office',
  regional_manager: 'Regional',
  director: 'Director',
  internal_rep: 'Internal',
  ibo_level_1: 'IBO 1',
  ibo_level_2: 'IBO 2',
  ibo_level_3: 'IBO 3',
  ibo_level_4: 'IBO 4',
};

function money(value: number) {
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * The whole comp plan, every role side by side, plus the "3C Receives" margin.
 * Owner-only — the margin arrives from the API for no one else, and the caller
 * gates this component on isRole('owner') + finance:read.
 */
export function CompPlanMatrix() {
  const { user } = useAuth();
  const [rates, setRates] = useState<Partial<CompPlanRates>>({});
  const [margin, setMargin] = useState<CompPlanMargin>({});
  const [version, setVersion] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<CompPlanRates>>({});
  const [marginDraft, setMarginDraft] = useState<CompPlanMargin>({});

  const fetchPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/comp-plan', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load comp plan');
      setRates(json.rates ?? {});
      setMargin(json.margin ?? {});
      setVersion(json.version ?? '');
      setUpdatedAt(json.updatedAt ?? null);
      setUpdatedByName(json.updatedByName ?? null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comp plan');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  const startEditing = () => {
    setDraft(rates);
    setMarginDraft(margin);
    setEditing(true);
  };

  const updateRate = (role: CompPlanRole, company: string, planId: string, value: string) => {
    const amount = Number(value) || 0;
    setDraft((previous) => ({
      ...previous,
      [role]: {
        ...previous[role],
        [company]: { ...previous[role]?.[company], [planId]: amount < 0 ? 0 : amount },
      },
    }));
  };

  const updateMargin = (company: string, planId: string, value: string) => {
    const amount = Number(value) || 0;
    setMarginDraft((previous) => ({
      ...previous,
      [company]: { ...previous[company], [planId]: amount < 0 ? 0 : amount },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/comp-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ rates: draft, margin: marginDraft, version }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to save');
      setEditing(false);
      setSuccess('Comp plan updated');
      window.setTimeout(() => setSuccess(''), 3000);
      await fetchPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const shownRates = editing ? draft : rates;
  const shownMargin = editing ? marginDraft : margin;

  return (
    <section className="comp-plan" aria-labelledby="comp-plan-title">
      <div className="comp-plan-head">
        <h2 id="comp-plan-title">Comp plan</h2>
        {!editing && !loading && (
          <button className="resources-line-edit-rates" type="button" onClick={startEditing}>
            <Edit3 aria-hidden="true" /> Edit rates <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="comp-plan-note">
        Owner only · paid per install{version ? ` · plan ${version}` : ''}
      </p>

      {error && (
        <div className="resources-line-status resources-line-status-error" role="alert">
          <AlertCircle aria-hidden="true" />
          {error}
        </div>
      )}
      {success && (
        <div className="resources-line-status resources-line-status-success" role="status">
          <Save aria-hidden="true" />
          {success}
        </div>
      )}

      {loading ? (
        <div className="resources-line-pay-skeleton" aria-label="Loading comp plan">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="comp-plan-scroll">
          <table className="comp-plan-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                {COMP_PLAN_ROLES.map((role) => (
                  <th key={role} scope="col" title={RoleDisplayNames[role]}>
                    {ROLE_SHORT[role]}
                  </th>
                ))}
                <th scope="col" className="comp-plan-margin-cell">
                  3C Receives
                </th>
              </tr>
            </thead>
            {FIBER_COMPANIES.map((company) => (
              <tbody key={company.value}>
                <tr className="comp-plan-group">
                  <th scope="colgroup" colSpan={COMP_PLAN_ROLES.length + 2}>
                    {company.label}
                  </th>
                </tr>
                {FIBER_PLANS.filter((plan) => plan.company === company.value).map((plan) => (
                  <tr key={plan.id}>
                    <th scope="row">{plan.name}</th>
                    {COMP_PLAN_ROLES.map((role) => {
                      const rate = shownRates[role]?.[company.value]?.[plan.id] ?? 0;
                      return (
                        <td key={role}>
                          {editing ? (
                            <input
                              className="resources-line-rate-input"
                              type="number"
                              min="0"
                              step="0.5"
                              value={rate}
                              onChange={(event) =>
                                updateRate(role, company.value, plan.id, event.target.value)
                              }
                              aria-label={`${RoleDisplayNames[role]} rate for ${plan.name}`}
                            />
                          ) : rate > 0 ? (
                            money(rate)
                          ) : (
                            <span className="comp-plan-empty" title="No contracted rate yet">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="comp-plan-margin-cell">
                      {editing ? (
                        <input
                          className="resources-line-rate-input"
                          type="number"
                          min="0"
                          step="0.5"
                          value={shownMargin[company.value]?.[plan.id] ?? 0}
                          onChange={(event) => updateMargin(company.value, plan.id, event.target.value)}
                          aria-label={`3C Receives for ${plan.name}`}
                        />
                      ) : (shownMargin[company.value]?.[plan.id] ?? 0) > 0 ? (
                        money(shownMargin[company.value][plan.id])
                      ) : (
                        <span className="comp-plan-empty">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {editing && (
        <div className="resources-line-edit-actions">
          <button type="button" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}>
            <Save aria-hidden="true" /> {saving ? 'Saving...' : 'Save plan'}
          </button>
        </div>
      )}

      {updatedAt && (
        <p className="resources-line-updated">
          Last updated{' '}
          {new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {updatedByName ? ` by ${updatedByName}` : ''}
        </p>
      )}
    </section>
  );
}
