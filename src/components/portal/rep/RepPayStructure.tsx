'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock3, Edit3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ratesArePending, CommissionConfig, FieldRole, RoleDisplayNames, repFacingRoleLabel } from '@/types';
import { LoadFailed } from './RepLearn';
import s from './rep.module.css';
import p from './rep-page.module.css';
import l from './rep-learn.module.css';

interface PayStructureResponse {
  tiers: CommissionConfig[];
  scope: 'own' | 'all';
  updatedAt: string | null;
  updatedByName: string | null;
}

const TIER_NOTES: Record<FieldRole, string> = {
  entry_rep: 'Commission on your own approved sales.',
  entry_level_rep: 'Entry-level onboarding role; commission begins after promotion.',
  l1_manager: 'Commission on your own sales plus an override on your team.',
  l2_manager: 'Commission on your own sales plus an override on your organization.',
  ibo_level_1: 'Commission on your own approved sales at your tier rate.',
  ibo_level_2: 'Commission on your own approved sales at your tier rate.',
  ibo_level_3: 'Commission on your own approved sales at your tier rate.',
  ibo_level_4: 'Commission on your own approved sales at your tier rate.',
  general_manager: 'General Manager commission on your own sales plus an override on your team.',
  gm_in_training: 'GM in Training commission on your own approved sales.',
  office_manager: 'Office Manager commission on your own sales plus an override on your team.',
  ae_tier_1: 'Account Executive Tier 1 commission on your own approved sales.',
  ae_tier_2: 'Account Executive Tier 2 commission on your own approved sales.',
  regional_manager: 'Regional Manager commission on your own approved sales.',
  director: 'Director commission on your own approved sales.',
  internal_rep: 'Internal Rep commission on your own approved sales.',
};

/**
 * Pay structure on the Resources hub. The API scopes it: a field user gets
 * only their own tier; platform users (admin/operations) get every tier and
 * admins can edit rates. The owner-only comp plan (with margin) sits below.
 */
export function RepPayStructure() {
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
    setLoading(true);
    try {
      // Tiers are scoped to the caller's own role, resolved from this token.
      const token = await getIdToken();
      const response = await fetch('/api/portal/commission', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pay structure');
      setData(json);
      setDraft(json.tiers);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pay structure');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStructure();
  }, [fetchStructure]);

  const updateDraft = (fieldRole: FieldRole, key: 'baseRate' | 'overrideRate', value: string) => {
    setDraft((previous) => previous.map((tier) => (
      tier.fieldRole === fieldRole ? { ...tier, [key]: Number(value) || 0 } : tier
    )));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/commission', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ tiers: draft }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to save');
      setEditing(false);
      setSuccess('Pay structure updated');
      window.setTimeout(() => setSuccess(''), 3000);
      await fetchStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const tiers = editing ? draft : data?.tiers ?? [];
  const ratesPending = data ? ratesArePending(data.tiers) : false;
  const ownTier = data?.scope === 'own' ? data.tiers[0] : undefined;
  // IBO tiers are never named to reps (null drops the line).
  const ownRoleLabel = ownTier ? repFacingRoleLabel(ownTier.fieldRole) : 'Your tier';

  return (
    <section className={s.panel} aria-labelledby="pay-structure-title">
      <div className={s.panelHead}>
        <h2 id="pay-structure-title" className={s.kicker}>Pay structure</h2>
        {isAdmin && data?.scope === 'all' && !editing && (
          <button className={p.headLink} type="button" onClick={() => { setDraft(data.tiers); setEditing(true); }}>
            <Edit3 size={14} aria-hidden="true" /> Edit rates
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className={l.skelBody} aria-busy="true" aria-label="Loading pay structure">
          <span className={`${s.skel} ${p.skelLineShort}`} />
          <span className={`${s.skel} ${p.skelLine}`} />
          <span className={`${s.skel} ${p.skelLine}`} />
        </div>
      ) : !data ? (
        <LoadFailed what="pay structure" onRetry={() => void fetchStructure()} />
      ) : (
        <>
          {(error || success || ratesPending) && (
            <div className={l.payNotices}>
              {error && (
                <div className={`${p.notice} ${p.noticeRed}`} role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className={`${p.notice} ${p.noticeLime}`} role="status">
                  <Check size={16} aria-hidden="true" />
                  <span>{success}</span>
                </div>
              )}
              {ratesPending && (
                <div className={`${p.notice} ${p.noticeAmber}`} role="status">
                  <Clock3 size={16} aria-hidden="true" />
                  <span>Leadership is confirming the final rates. These numbers are placeholders for now.</span>
                </div>
              )}
            </div>
          )}

          {data.scope === 'own' ? (
            <div className={l.rate}>
              <p className={s.kicker}>Your rate</p>
              {ownRoleLabel !== null ? <p className={l.rateRole}>{ownRoleLabel}</p> : null}
              <dl className={l.rateFigures}>
                <div>
                  <dt>Base</dt>
                  <dd>{ownTier?.baseRate ?? 0}%</dd>
                </div>
                <div>
                  <dt>Override</dt>
                  <dd>{ownTier?.overrideRate == null ? '—' : `${ownTier.overrideRate}%`}</dd>
                </div>
              </dl>
              <p className={l.rateNote}>{ownTier?.notes || TIER_NOTES[ownTier?.fieldRole ?? 'entry_rep']}</p>
            </div>
          ) : (
            <div>
              {tiers.map((tier) => (
                <div className={l.tier} key={tier.fieldRole}>
                  <span>{RoleDisplayNames[tier.fieldRole]}</span>
                  {editing ? (
                    <span className={l.tierInputs}>
                      <label>
                        Base
                        <input
                          className={p.input}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.5"
                          value={tier.baseRate}
                          onChange={(event) => updateDraft(tier.fieldRole, 'baseRate', event.target.value)}
                          aria-label={`Base rate for ${RoleDisplayNames[tier.fieldRole]}`}
                        />
                      </label>
                      {tier.overrideRate !== undefined && (
                        <label>
                          Override
                          <input
                            className={p.input}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            value={tier.overrideRate}
                            onChange={(event) => updateDraft(tier.fieldRole, 'overrideRate', event.target.value)}
                            aria-label={`Override rate for ${RoleDisplayNames[tier.fieldRole]}`}
                          />
                        </label>
                      )}
                    </span>
                  ) : (
                    <span className={l.tierRate}>
                      {tier.baseRate}%{tier.overrideRate === undefined ? '' : ` + ${tier.overrideRate}%`}
                    </span>
                  )}
                </div>
              ))}
              {editing && (
                <div className={l.editActions}>
                  <button className={s.btnSecondary} type="button" onClick={() => { setEditing(false); setDraft(data.tiers); }} disabled={saving}>
                    Cancel
                  </button>
                  <button className={s.btnPrimary} type="button" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save rates'}
                  </button>
                </div>
              )}
            </div>
          )}

          {data.updatedAt && (
            <p className={l.updated}>
              Last updated {new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {data.updatedByName ? ` by ${data.updatedByName}` : ''}
            </p>
          )}
        </>
      )}
    </section>
  );
}
