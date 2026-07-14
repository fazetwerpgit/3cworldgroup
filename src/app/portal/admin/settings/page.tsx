'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const InertNote = () => <span className="admin-line-inert-note">Not wired up yet</span>;

export default function AdminSettingsPage() {
  const { isRole } = useAuth();
  const isAdmin = isRole('admin');

  if (!isAdmin) {
    return (
      <div className="admin-line-main">
        <div className="admin-line">
          <div className="admin-line-role-denied">
            <Lock className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--admin-line-red)' }} />
            <p style={{ fontSize: 16, fontWeight: 900 }}>Access Denied</p>
            <p className="admin-line-sub" style={{ marginTop: 6 }}>Only admins can access system settings.</p>
            <Link href="/portal/dashboard" className="admin-line-primary" style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none' }}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-line-main">
      <div className="admin-line">
        <header className="admin-line-hero">
          <div>
            <div className="admin-line-kicker">admin settings / control room</div>
            <h1>
              <span className="accent">Tune the control</span>
              <span className="plain">without hiding the risk.</span>
            </h1>
            <p className="admin-line-intro">
              These sections mirror the real settings this portal will eventually persist. None of
              them write anywhere yet — every control below is disabled on purpose rather than
              faking a save.
            </p>
          </div>
          <div className="admin-line-hero-count">
            <span className="admin-line-display portal-metallic-num">3</span>
            <small>sections to tune</small>
          </div>
        </header>

        <div className="admin-line-settings-grid">
          <section className="admin-line-settings-card">
            <div className="admin-line-eyebrow">01 / company</div>
            <h2>Company identity.</h2>
            <div className="admin-line-field">
              <label htmlFor="company-name">Company name</label>
              <input id="company-name" value="3C World Group" disabled readOnly />
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label htmlFor="support-email">Support email</label>
              <input id="support-email" type="email" value="support@3cworldgroup.com" disabled readOnly />
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label>Default role for new users</label>
              <div className="admin-line-segmented" role="group" aria-label="Default role">
                {['Field rep', 'Operations', 'Admin'].map((label, i) => (
                  <button key={label} type="button" aria-pressed={i === 0} disabled>
                    {label}
                  </button>
                ))}
              </div>
              <InertNote />
            </div>
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save company
              </button>
              <InertNote />
            </div>
          </section>

          <section className="admin-line-settings-card">
            <div className="admin-line-eyebrow">02 / sales &amp; points</div>
            <h2>Scoring boundaries.</h2>
            <div className="admin-line-toggle-row">
              <div>
                <strong>Auto-approve sales</strong>
                <small>Trust the current submission path.</small>
              </div>
              <button type="button" className="admin-line-toggle" aria-pressed={false} disabled>
                <span />
              </button>
            </div>
            <div className="admin-line-field">
              <label>Points / min · default · max</label>
              <div className="admin-line-number-grid">
                <input aria-label="Minimum points" value={0} type="number" disabled readOnly />
                <input aria-label="Default points" value={10} type="number" disabled readOnly />
                <input aria-label="Maximum points" value={100} type="number" disabled readOnly />
              </div>
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label>Leaderboard periods / multi-toggle</label>
              <div className="admin-line-multi-toggle">
                {['Day', 'Week', 'Month', 'Quarter', 'Year', 'All-time'].map((label, i) => (
                  <button key={label} type="button" aria-pressed={i < 3} disabled>
                    {label}
                  </button>
                ))}
              </div>
              <InertNote />
            </div>
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save points
              </button>
              <InertNote />
            </div>
          </section>

          <section className="admin-line-settings-card">
            <div className="admin-line-eyebrow">03 / alerts</div>
            <h2>Notification lines.</h2>
            {[
              { label: 'New sale', sub: 'Tell the admin desk when a sale arrives.', on: true },
              { label: 'Approved', sub: "Keep the rep's next step visible.", on: true },
              { label: 'Rejected', sub: 'Surface the reason, not just the state.', on: false },
              { label: 'Leaderboard changes', sub: 'Broadcast movement without noise.', on: true },
            ].map((row) => (
              <div className="admin-line-toggle-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.sub}</small>
                </div>
                <button type="button" className="admin-line-toggle" aria-pressed={row.on} disabled>
                  <span />
                </button>
              </div>
            ))}
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save alerts
              </button>
              <InertNote />
            </div>
          </section>
        </div>

        <div className="admin-line-danger-room">
          <div className="admin-line-eyebrow" style={{ color: 'var(--admin-line-red)' }}>
            danger room / contained
          </div>
          <h2>Reset a system only on purpose.</h2>
          <div className="admin-line-danger-actions">
            <div className="admin-line-danger-action">
              <strong>Reset sales</strong>
              <p>Clears the sales ledger for a fresh review.</p>
              <button type="button" disabled>
                Reset sales
              </button>
              <div className="admin-line-danger-confirm">
                <input className="admin-line-danger-input" type="text" placeholder="Type RESET" aria-label="Type RESET to reset sales" disabled readOnly />
                <button type="button" className="confirm" disabled>
                  Confirm reset
                </button>
              </div>
              <InertNote />
            </div>
            <div className="admin-line-danger-action">
              <strong>Reset leaderboard</strong>
              <p>Returns the ranking board to its starting state.</p>
              <button type="button" disabled>
                Reset leaderboard
              </button>
              <div className="admin-line-danger-confirm">
                <input className="admin-line-danger-input" type="text" placeholder="Type RESET" aria-label="Type RESET to reset leaderboard" disabled readOnly />
                <button type="button" className="confirm" disabled>
                  Confirm reset
                </button>
              </div>
              <InertNote />
            </div>
          </div>
          <p className="admin-line-sub" style={{ marginTop: 12 }}>
            Real settings persistence and reset endpoints are follow-up work, out of this round — a
            destructive reset needs its own authorization and audit-trail design, not just a typed
            client-side gate.
          </p>
        </div>
      </div>
    </div>
  );
}
