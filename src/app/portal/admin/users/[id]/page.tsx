'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ClipboardCheck, Eye, Lock } from 'lucide-react';
import { UserForm } from '@/components/admin/UserForm';
import {
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  User,
  UserRole,
  RoleDisplayNames,
  getEffectiveRole,
  isAdminLevel,
  isOwner,
  PipelineStageConfig,
  type PipelineRep,
  type PipelineStage,
} from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import d from '../user-detail.module.css';
import { OnboardingFile } from '../OnboardingFile';

const STATUS_TONE: Record<string, Tone> = { active: 'lime', pending: 'amber', inactive: 'muted' };

// Same stage colours as the Hiring → Pipeline tab.
const STAGE_TONE: Record<PipelineStage, Tone> = {
  processing: 'amber',
  need_logins: 'blue',
  cleared_to_sell: 'lime',
  active: 'lime',
  decommissioned: 'muted',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EditUserPage() {
  const params = useParams();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [salesCount, setSalesCount] = useState(0);
  const [sensitive, setSensitive] = useState<{ ssnLast4: string | null; dlLast4: string | null } | null>(null);
  const [revealed, setRevealed] = useState<{ ssn: string | null; dlNumber: string | null } | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealLogged, setRevealLogged] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [revealing, setRevealing] = useState(false);
  // This person's row from the existing pipeline route: undefined while
  // loading, null when the pipeline doesn't cover them (not a field rep) or
  // couldn't be read.
  const [pipelineRep, setPipelineRep] = useState<PipelineRep | null | undefined>(undefined);

  const userId = params.id as string;

  const fetchUser = useCallback(async () => {
    if (!currentUser || !userId) return;
    setLoading(true);
    setError('');
    try {
      // The route verifies the caller from the token; userId is the TARGET
      // account being opened.
      const token = await getIdToken();
      const response = await fetch(`/api/portal/auth/users/${userId}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch user');
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user');
    } finally {
      setLoading(false);
    }
  }, [userId, currentUser]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  // Real approved-sales count for this specific person, same existing
  // leaderboard endpoint used on the People view — no new route. Absence
  // from the board means zero approved sales, so it renders as "0", never "—".
  useEffect(() => {
    if (!currentUser || !userId) return;
    let active = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch('/api/portal/leaderboard?period=all&metric=totalSales&limit=1000', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        if (!active || !res.ok) return;
        const entry = (data.leaderboard || []).find((e: { salesRepId: string }) => e.salesRepId === userId);
        setSalesCount(entry ? entry.totalSales : 0);
      } catch {
        if (active) setSalesCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser, userId]);

  // Where this person stands (stage, last sign-in, checklist, sales), from the
  // existing management-only pipeline route. It covers field reps only.
  useEffect(() => {
    if (!currentUser || !userId) return;
    let active = true;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/portal/pipeline', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        const reps: PipelineRep[] = res.ok && Array.isArray(data.reps) ? data.reps : [];
        setPipelineRep(reps.find((rep) => rep.uid === userId) ?? null);
      } catch {
        if (active) setPipelineRep(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser, userId]);

  // Real masked last-4 (admin only). Sends a REAL Firebase ID token — the
  // server verifies it before returning anything. Unchanged from today.
  useEffect(() => {
    if (!isAdminLevel(currentUser?.role) || !userId) return;
    let active = true;
    (async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch(`/api/portal/admin/sensitive/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (active) setSensitive({ ssnLast4: d.ssnLast4, dlLast4: d.dlLast4 });
    })().catch(() => {
      if (active) setSensitive(null);
    });
    return () => {
      active = false;
    };
  }, [currentUser, userId]);

  // Only a successful reveal was decrypted and logged; any failure keeps the
  // confirm open with the server's reason and a Retry.
  const doReveal = async () => {
    setRevealError('');
    setRevealing(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('you are signed out, sign in again');
      const r = await fetch(`/api/portal/admin/sensitive/${userId}?reveal=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Failed to reveal sensitive fields');
      // Stored as 9 bare digits; shown the way people read an SSN.
      setRevealed({ ssn: d.ssn?.replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3') ?? null, dlNumber: d.dlNumber });
      setRevealLogged(true);
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal sensitive fields');
    } finally {
      setRevealing(false);
    }
  };

  const userRole = user ? getEffectiveRole(user) : undefined;
  const userRoleLabel = userRole ? RoleDisplayNames[userRole as UserRole] : 'Role not set';
  const userStatusLabel = user?.status ? user.status.replace(/^./, (c) => c.toUpperCase()) : 'Active';

  const back = { href: '/portal/admin/people?tab=everyone', label: 'People' };
  const showVault = isAdminLevel(currentUser?.role) && sensitive && (sensitive.ssnLast4 || sensitive.dlLast4);
  const viewerIsOwner = isOwner(currentUser?.role);
  // Sales sit in "Where they are" for anyone the pipeline covers; the side
  // panel is the fallback for everyone else. An empty side column is dropped.
  const showSalesPanel = pipelineRep === null;
  const showAsideVault = Boolean(showVault) && !viewerIsOwner;
  const showAside = showSalesPanel || showAsideVault;

  // The masked SSN / DL# with its recorded Reveal. Admins see it in the side
  // column; an owner sees it inside the onboarding file instead.
  const vaultContent = sensitive ? (
    <>
      <p className={u.hint}>
        Their Social Security and driver license numbers. Hidden until you choose to see them, and every look is
        recorded.
      </p>
      <dl className={`${u.facts} ${d.vaultFacts}`}>
        <div>
          <dt>Social security number</dt>
          <dd className={u.num}>{revealed?.ssn ?? (sensitive.ssnLast4 ? `•••••${sensitive.ssnLast4}` : '—')}</dd>
        </div>
        <div>
          <dt>Driver license reference</dt>
          <dd className={u.num}>{revealed?.dlNumber ?? (sensitive.dlLast4 ? `•••••${sensitive.dlLast4}` : '—')}</dd>
        </div>
      </dl>

      {!revealed && !revealOpen ? (
        <div className={d.revealRow}>
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setRevealOpen(true)}>
            <Eye size={16} aria-hidden="true" />
            Reveal for this session
          </button>
          <span className={u.hint}>This view is recorded.</span>
        </div>
      ) : null}

      {revealOpen && !revealed ? (
        <div className={d.revealConfirm} role="alert">
          <p>Confirm reveal? This is a one-session view of sensitive records, and it is recorded.</p>
          <div className={u.btnRow}>
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
              onClick={() => setRevealOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
              onClick={() => void doReveal()}
              disabled={revealing}
            >
              {revealing ? 'Revealing…' : revealError ? 'Retry' : 'Continue'}
            </button>
          </div>
          {revealError ? (
            <AdminNotice tone="error">Couldn&apos;t reveal: {revealError}. Nothing was shown or logged.</AdminNotice>
          ) : null}
        </div>
      ) : null}

      {revealLogged ? <AdminNotice tone="ok">Reveal logged for this session.</AdminNotice> : null}
    </>
  ) : null;

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        {user ? (
          <>
            <AdminPageHead
              back={back}
              title={user.displayName || user.email || 'User'}
              meta={
                <span className={d.headMeta}>
                  <span>{userRoleLabel}</span>
                  <StatusDot tone={STATUS_TONE[user.status || 'active'] ?? 'muted'}>{userStatusLabel}</StatusDot>
                </span>
              }
              sub={user.email}
            />

            {pipelineRep ? (
              <section className={s.panel} aria-labelledby="person-where-heading">
                <div className={`${s.panelHead} ${u.band}`}>
                  <h2 id="person-where-heading" className={s.kicker}>
                    Where they are
                  </h2>
                </div>
                <div className={`${u.panelBody} ${d.summaryBody}`}>
                  <p className={u.hint}>
                    Their place in hiring and selling, worked out from their checklist, portal sign-ins and sales.
                  </p>
                  <dl className={`${u.facts} ${d.summaryFacts}`}>
                    <div>
                      <dt>Stage</dt>
                      <dd className={d.stageWord}>
                        <StatusDot tone={STAGE_TONE[pipelineRep.stage]}>
                          {PipelineStageConfig[pipelineRep.stage].name}
                        </StatusDot>
                        <span className={u.cellSub}>{PipelineStageConfig[pipelineRep.stage].description}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Last portal sign-in</dt>
                      <dd>{pipelineRep.lastSignInAt ? formatDay(pipelineRep.lastSignInAt) : 'Never'}</dd>
                    </div>
                    <div>
                      <dt>Checklist</dt>
                      <dd>
                        {pipelineRep.onboarding
                          ? `${pipelineRep.onboarding.approved} of ${pipelineRep.onboarding.total} approved`
                          : 'None (joined before the checklist)'}
                      </dd>
                    </div>
                    <div>
                      <dt>Approved sales</dt>
                      <dd className={u.num}>{pipelineRep.approvedSales}</dd>
                    </div>
                    <div>
                      <dt>Carrier report orders</dt>
                      <dd className={u.num}>{pipelineRep.carrierOrders}</dd>
                    </div>
                  </dl>
                  <p className={u.hint}>
                    Approved sales are sales entered in the portal and approved. Carrier report orders are orders under
                    their dealer code on the carrier&apos;s report.
                  </p>
                  {!viewerIsOwner && pipelineRep.onboarding && pipelineRep.onboarding.total > 0 ? (
                    <div className={u.btnRow}>
                      <Link
                        href={`/portal/admin/onboarding?tab=todo&person=${encodeURIComponent(userId)}`}
                        className={`${s.btnSecondary} ${u.sm}`}
                      >
                        <ClipboardCheck size={16} aria-hidden="true" />
                        Check documents
                      </Link>
                      <span className={u.hint}>Opens their checklist so you can Approve or Ask to fix each item.</span>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className={`${d.layout} ${showAside ? '' : d.solo}`}>
              <div className={d.main}>
                <UserForm user={user} />
                {viewerIsOwner ? (
                  <OnboardingFile
                    userId={userId}
                    vault={showVault ? <div className={d.vaultBody}>{vaultContent}</div> : null}
                  />
                ) : null}
              </div>

              {showAside ? (
                <aside className={d.aside} aria-label="Record summary">
                  {showSalesPanel ? (
                    <section className={s.panel} aria-labelledby="person-sales-heading">
                      <div className={`${u.panelBody} ${d.salesBody}`}>
                        <h2 id="person-sales-heading" className={s.kicker}>
                          Approved sales
                        </h2>
                        <p className={u.hint}>Sales entered in the portal and approved for this person.</p>
                        <strong className={`${u.statValue} ${salesCount > 0 ? u.statHot : ''}`}>{salesCount}</strong>
                        <span className={u.statNote}>All time</span>
                      </div>
                    </section>
                  ) : null}

                  {showAsideVault ? (
                    <section className={`${s.panel} ${d.vault}`} aria-labelledby="person-vault-heading">
                      <div className={`${s.panelHead} ${u.band}`}>
                        <h2 id="person-vault-heading" className={s.kicker}>
                          Sensitive information
                        </h2>
                        <span className={u.tag}>
                          <Lock size={12} aria-hidden="true" />
                          Admin only
                        </span>
                      </div>
                      <div className={`${u.panelBody} ${d.vaultBody}`}>{vaultContent}</div>
                    </section>
                  ) : null}
                </aside>
              ) : null}
            </div>
          </>
        ) : loading ? (
          <>
            <div className={d.headSkel} role="status" aria-label="Loading record">
              <span className={s.skel} style={{ width: 72, height: 16 }} />
              <span className={s.skel} style={{ width: 'min(320px, 70%)', height: 40 }} />
              <span className={s.skel} style={{ width: 180, height: 14 }} />
            </div>
            <section className={s.panel}>
              <AdminSkeletonRows rows={4} label="Loading record" />
            </section>
          </>
        ) : (
          <>
            <AdminPageHead back={back} title="Member record" />
            <section className={s.panel}>
              <AdminFailed what="this record" detail={error || undefined} onRetry={() => void fetchUser()} />
            </section>
          </>
        )}
      </div>
    </AdminGate>
  );
}
