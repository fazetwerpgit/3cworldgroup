'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Eye, Lock } from 'lucide-react';
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
import { User, UserRole, RoleDisplayNames, getEffectiveRole, isAdminLevel } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import d from '../user-detail.module.css';

const STATUS_TONE: Record<string, Tone> = { active: 'lime', pending: 'amber', inactive: 'muted' };

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

  const doReveal = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const r = await fetch(`/api/portal/admin/sensitive/${userId}?reveal=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    setRevealed({ ssn: d.ssn, dlNumber: d.dlNumber });
    setRevealLogged(true);
  };

  const userRole = user ? getEffectiveRole(user) : undefined;
  const userRoleLabel = userRole ? RoleDisplayNames[userRole as UserRole] : 'Role not set';
  const userStatusLabel = user?.status ? user.status.replace(/^./, (c) => c.toUpperCase()) : 'Active';

  const back = { href: '/portal/admin/users', label: 'Users' };
  const showVault = isAdminLevel(currentUser?.role) && sensitive && (sensitive.ssnLast4 || sensitive.dlLast4);

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

            <div className={d.layout}>
              <div className={d.main}>
                <UserForm user={user} />
              </div>

              <aside className={d.aside} aria-label="Record summary">
                <section className={s.panel} aria-labelledby="person-sales-heading">
                  <div className={`${u.panelBody} ${d.salesBody}`}>
                    <h2 id="person-sales-heading" className={s.kicker}>
                      Approved sales
                    </h2>
                    <strong className={`${u.statValue} ${salesCount > 0 ? u.statHot : ''}`}>{salesCount}</strong>
                    <span className={u.statNote}>All time</span>
                  </div>
                </section>

                {showVault ? (
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
                    <div className={`${u.panelBody} ${d.vaultBody}`}>
                      <p className={u.hint}>Admin-only values stay masked until you choose to view them.</p>
                      <dl className={`${u.facts} ${d.vaultFacts}`}>
                        <div>
                          <dt>Social security number</dt>
                          <dd className={u.num}>
                            {revealed?.ssn ?? (sensitive.ssnLast4 ? `•••••${sensitive.ssnLast4}` : '—')}
                          </dd>
                        </div>
                        <div>
                          <dt>Driver license reference</dt>
                          <dd className={u.num}>
                            {revealed?.dlNumber ?? (sensitive.dlLast4 ? `•••••${sensitive.dlLast4}` : '—')}
                          </dd>
                        </div>
                      </dl>

                      {!revealed && !revealOpen ? (
                        <div className={d.revealRow}>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm}`}
                            onClick={() => setRevealOpen(true)}
                          >
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
                            <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.danger}`} onClick={doReveal}>
                              Continue
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {revealLogged ? <AdminNotice tone="ok">Reveal logged for this session.</AdminNotice> : null}
                    </div>
                  </section>
                ) : null}
              </aside>
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
