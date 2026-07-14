'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserForm } from '@/components/admin/UserForm';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { User, UserRole, RoleDisplayNames, getEffectiveRole } from '@/types';

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
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

  useEffect(() => {
    async function fetchUser() {
      if (!currentUser) return;
      try {
        const response = await fetch(
          `/api/portal/auth/users/${userId}?requestedBy=${currentUser.uid}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch user');
        setUser(data.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user');
      } finally {
        setLoading(false);
      }
    }
    if (userId) fetchUser();
  }, [userId, currentUser]);

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
    if (currentUser?.role !== 'admin' || !userId) return;
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

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="admin-line-main">
        <div className="admin-line">
          {loading && (
            <div className="admin-line-empty-state" style={{ display: 'block' }}>
              <strong>Loading record…</strong>
            </div>
          )}

          {error && (
            <div className="admin-line-empty-state" style={{ display: 'block', borderColor: 'var(--admin-line-red)', color: 'var(--admin-line-red)' }}>
              {error}
            </div>
          )}

          {user && (
            <>
              <header className="admin-line-hero">
                <div>
                  <div className="admin-line-kicker">person record / approved sales</div>
                  <h1>
                    <span className="accent">{user.displayName || user.email}.</span>
                    <span className="plain">Make the record useful.</span>
                  </h1>
                  <p className="admin-line-intro">
                    The same record surface serves editing and creating. Keep identity clear, role
                    decisions explicit, and sensitive records behind a visible boundary.
                  </p>
                  <div className="admin-line-quick-rail">
                    <span className="admin-line-role">
                      {(() => {
                        const effective = getEffectiveRole(user);
                        return effective ? RoleDisplayNames[effective as UserRole] : '—';
                      })()}
                    </span>
                    <span className={`admin-line-status ${user.status || 'active'}`}>
                      {(user.status || 'active').replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <span className="admin-line-chip">
                      employee / {user.uid.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="admin-line-hero-count">
                  <span className="admin-line-display portal-metallic-num">{salesCount}</span>
                  <small>approved sales</small>
                </div>
              </header>

              <button
                type="button"
                className="admin-line-clear-button"
                style={{ marginTop: 14 }}
                onClick={() => router.push('/portal/admin/users')}
              >
                ← Back to roster
              </button>

              <div className="admin-line-person-layout">
                <main className="admin-line-panel">
                  <UserForm user={user} isEdit />

                  {currentUser?.role === 'admin' && sensitive && (sensitive.ssnLast4 || sensitive.dlLast4) && (
                    <div className="admin-line-form-section admin-line-vault">
                      <div className="admin-line-eyebrow">03 / sensitive records</div>
                      <h3>Vaulted, not casual.</h3>
                      <p className="admin-line-sub">
                        Admin-only reference values remain masked until someone names the risk.
                      </p>
                      <div className="admin-line-vault-grid">
                        <div className="admin-line-vault-item">
                          <strong>{revealed?.ssn ?? (sensitive.ssnLast4 ? `•••••${sensitive.ssnLast4}` : '—')}</strong>
                          <small>
                            Social security number <Lock className="admin-line-lock" />
                          </small>
                        </div>
                        <div className="admin-line-vault-item">
                          <strong>{revealed?.dlNumber ?? (sensitive.dlLast4 ? `•••••${sensitive.dlLast4}` : '—')}</strong>
                          <small>
                            Driver license reference <Lock className="admin-line-lock" />
                          </small>
                        </div>
                      </div>
                      {!revealed && (
                        <div className="admin-line-vault-actions">
                          <button
                            type="button"
                            className="admin-line-action"
                            onClick={() => setRevealOpen(true)}
                          >
                            Reveal for this session
                          </button>
                          <span className="admin-line-meta">audit trail records the reveal</span>
                        </div>
                      )}
                      {revealOpen && !revealed && (
                        <div className="admin-line-reveal-confirm" style={{ display: 'block' }}>
                          Confirm reveal? This is a one-session view of sensitive records.{' '}
                          <button type="button" className="admin-line-action" onClick={doReveal}>
                            Continue
                          </button>
                        </div>
                      )}
                      {revealLogged && (
                        <div className="admin-line-reveal-confirm" style={{ display: 'block' }}>
                          Reveal logged for this session.
                        </div>
                      )}
                    </div>
                  )}
                </main>
                <aside className="admin-line-panel">
                  <div className="admin-line-eyebrow">record posture</div>
                  <h2 style={{ margin: '7px 0 0', fontSize: 20, fontWeight: 900, letterSpacing: '-.06em', textTransform: 'uppercase' }}>
                    One person, one decision.
                  </h2>
                  <p className="admin-line-sub">
                    Role chips, status chips, and a named manager keep the record legible to the next
                    admin.
                  </p>
                  <div className="admin-line-quick-rail">
                    <span className="admin-line-chip lime">{salesCount} sales</span>
                  </div>
                  <div className="admin-line-form-section">
                    <div className="admin-line-eyebrow">saved lines</div>
                    <p className="admin-line-sub">
                      Profile edits save inline. Dirty fields pull the save bar into view.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
