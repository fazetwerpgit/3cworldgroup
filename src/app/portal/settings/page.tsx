'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MemberLineShell, MemberLineMasthead, MemberLineSectionIndex, MemberLineLock } from '@/components/member/MemberLine';
import ReportBugCard from '@/components/portal/ReportBugCard';
import ThemeToggleCard from '@/components/portal/ThemeToggleCard';
import InstallAppCard from '@/components/portal/InstallAppCard';
import PushNotificationsCard from '@/components/portal/PushNotificationsCard';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

// Structural fact, not a live metric: Settings always has exactly these 5
// real panels (identity, bug report, password, app+appearance, sensitive
// boundary) — same reasoning as Resources' static lane count.
const SETTINGS_GROUP_COUNT = 5;

function getInitials(displayName?: string, email?: string) {
  const name = (displayName || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email || 'U').charAt(0).toUpperCase();
}

export default function SettingsPage() {
  const { user, resetPassword, changePassword, refreshUser } = useAuth();
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Profile editing state — always-editable inputs on this canvas (mockup has
  // no separate edit mode), saved on demand via "Save member lines".
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await resetPassword(user.email);
      setResetSent(true);
    } catch {
      setError('Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully!');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('wrong-password') || err.message.includes('invalid-credential')) {
          setError('Current password is incorrect.');
        } else if (err.message.includes('weak-password')) {
          setError('New password is too weak. Please choose a stronger password.');
        } else {
          setError('Failed to change password. Please try again.');
        }
      } else {
        setError('Failed to change password. Please try again.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/portal/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, displayName, phone }),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      await refreshUser();
      setSuccess('Member lines saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : '';
  const initials = getInitials(user?.displayName, user?.email);

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatShortDate = (date: Date | string | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  const addressLine = [user?.city, user?.state].filter(Boolean).join(', ') + (user?.zip ? ` ${user.zip}` : '');
  const fullAddress = user?.address ? `${user.address}${addressLine ? `, ${addressLine}` : ''}` : addressLine || 'Not on file';

  return (
    <ProtectedRoute>
      <MemberLineShell>
        <MemberLineMasthead
          kicker="member broadcast / settings"
          headingLead="Set the signal."
          headingRest="Stay on the line."
          intro="A broadcast-ready member record: the open lines are yours to tune, the locked lines stay with the account."
          numeral={SETTINGS_GROUP_COUNT}
          numeralAriaLabel={`${SETTINGS_GROUP_COUNT} settings groups`}
          tools={
            <>
              <button
                type="button"
                className="member-line-chip lime"
                onClick={() => document.getElementById('report-bug')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Report a bug
              </button>
              <span className="member-line-chip">
                {initials} / {roleLabel} / {user?.status === 'active' ? 'active' : 'inactive'}
              </span>
            </>
          }
        />

        {(success || error) && (
          <div className="member-line-tools" style={{ marginTop: 16 }}>
            {success && <div className="member-line-note">{success}</div>}
            {error && <div className="member-line-note warn">{error}</div>}
          </div>
        )}

        <MemberLineSectionIndex index="01" label="who you are" />

        <div className="member-line-arena">
          <div className="member-line-stack">
            {/* Member identity panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <p className="member-line-eyebrow">01 / who you are</p>
                  <h2>Member identity</h2>
                  <p className="member-line-sub">
                    {user?.displayName || 'Member'} · employee ID {user?.uid?.slice(-6).toUpperCase()}
                  </p>
                </div>
                <span className="member-line-meta">open lines / locked lines</span>
              </div>

              <div className="member-line-profile-grid">
                <div className="member-line-field">
                  <label htmlFor="line-name">Display name / open</label>
                  <input
                    id="line-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="member-line-field">
                  <label htmlFor="line-phone">Phone / open</label>
                  <input
                    id="line-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-email">
                    Email / locked <MemberLineLock />
                  </label>
                  {/* Some older user docs lack an email field — fall back to the auth account's. */}
                  <input id="line-email" value={user?.email || auth?.currentUser?.email || ''} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-role">
                    Role / locked <MemberLineLock />
                  </label>
                  <input id="line-role" value={roleLabel} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-status">
                    Status / locked <MemberLineLock />
                  </label>
                  <input id="line-status" value={user?.status === 'active' ? 'Active' : 'Inactive'} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-hire">
                    Hire date / locked <MemberLineLock />
                  </label>
                  <input id="line-hire" value={formatDate(user?.hireDate)} readOnly />
                </div>
                <div className="member-line-field locked full">
                  <label htmlFor="line-address">
                    Address / locked <MemberLineLock />
                  </label>
                  <input id="line-address" value={fullAddress} readOnly />
                </div>
              </div>

              <div className="member-line-stats">
                <div className="member-line-stat">
                  <strong>{formatShortDate(user?.createdAt)}</strong>
                  <small>Member since</small>
                </div>
                <div className="member-line-stat">
                  <strong>{user?.territoryId || '—'}</strong>
                  <small>Territory</small>
                </div>
                <div className="member-line-stat">
                  <strong>{user?.uid?.slice(-6).toUpperCase() || '—'}</strong>
                  <small>Employee ID / last 6</small>
                </div>
                <div className="member-line-stat">
                  <strong>{user?.status === 'active' ? 'Yes' : 'No'}</strong>
                  <small>Active yes / no</small>
                </div>
              </div>

              <div className="member-line-actions">
                <button
                  type="button"
                  className="member-line-button primary small"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save member lines'}
                </button>
                <span className="member-line-status-text">
                  Contact your admin for role, territory, or address changes.
                </span>
              </div>
            </section>

            <ReportBugCard />
          </div>

          <aside className="member-line-stack">
            {/* Change password panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <p className="member-line-eyebrow">03 / security channel</p>
                  <h2>Change password</h2>
                  <p className="member-line-sub">Collapsed until you call it up.</p>
                </div>
              </div>
              <button
                type="button"
                className="member-line-button small"
                onClick={() => setShowPasswordForm((v) => !v)}
              >
                Change password
              </button>
              <div className={`member-line-collapsed ${showPasswordForm ? 'open' : ''}`}>
                <form onSubmit={handleChangePassword}>
                  <div className="member-line-profile-grid" style={{ marginTop: 14 }}>
                    <div className="member-line-field full">
                      <label htmlFor="line-current">Current password</label>
                      <input
                        id="line-current"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="member-line-field">
                      <label htmlFor="line-new">New password</label>
                      <input
                        id="line-new"
                        type="password"
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="member-line-field">
                      <label htmlFor="line-confirm">Confirm password</label>
                      <input
                        id="line-confirm"
                        type="password"
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="member-line-actions">
                    <button type="submit" className="member-line-button primary small" disabled={changingPassword}>
                      {changingPassword ? 'Updating…' : 'Update password'}
                    </button>
                    <button
                      type="button"
                      className="member-line-button small"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                <div className="member-line-actions" style={{ marginTop: 6 }}>
                  {resetSent ? (
                    <span className="member-line-status-text">Reset email sent!</span>
                  ) : (
                    <button
                      type="button"
                      className="member-line-button small"
                      onClick={handlePasswordReset}
                      disabled={loading}
                    >
                      {loading ? 'Sending…' : 'Email me a reset link instead'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* App + appearance panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <p className="member-line-eyebrow">04 / device channel</p>
                  <h2>App + appearance</h2>
                </div>
              </div>
              <InstallAppCard />
              <PushNotificationsCard />
              <ThemeToggleCard />
            </section>

            {/* Sensitive-data boundary panel */}
            <section className="member-line-panel">
              <p className="member-line-eyebrow">05 / hard boundary</p>
              <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--member-line-serif)', fontWeight: 600, fontSize: 22 }}>
                Never broadcast raw sensitive data.
              </h2>
              <p className="member-line-sub">
                No raw SSN, card numbers, or bank-account numbers in member settings.
              </p>
            </section>
          </aside>
        </div>
      </MemberLineShell>
    </ProtectedRoute>
  );
}
