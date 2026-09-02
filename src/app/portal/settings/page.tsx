'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MemberLineShell, MemberLineLock } from '@/components/member/MemberLine';
import ReportBugCard from '@/components/portal/ReportBugCard';
import ThemeToggleCard from '@/components/portal/ThemeToggleCard';
import InstallAppCard from '@/components/portal/InstallAppCard';
import PushNotificationsCard from '@/components/portal/PushNotificationsCard';
import { RoleDisplayNames, getEffectiveRole } from '@/types';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-rep-b.css';

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
      // The route derives the target user from this token — profile edits are
      // always self-service.
      const token = await getIdToken();
      const response = await fetch('/api/portal/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ displayName, phone }),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      await refreshUser();
      setSuccess('Changes saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : '';

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatShortDate = (date: Date | string | undefined) => {
    if (!date) return 'Not available';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  const addressLine = [user?.city, user?.state].filter(Boolean).join(', ') + (user?.zip ? ` ${user.zip}` : '');
  const fullAddress = user?.address ? `${user.address}${addressLine ? `, ${addressLine}` : ''}` : addressLine || 'Not on file';

  return (
    <ProtectedRoute>
      <MemberLineShell>
        <PageTitle title="Settings" />

        {(success || error) && (
          <div className="member-line-tools" style={{ marginTop: 16 }}>
            {success && <div className="member-line-note">{success}</div>}
            {error && <div className="member-line-note warn">{error}</div>}
          </div>
        )}

        <div className="member-line-arena">
          <div className="member-line-stack">
            {/* Profile panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <h2>Your profile</h2>
                  <p className="member-line-sub">
                    {user?.displayName || 'Member'}
                  </p>
                </div>
              </div>

              <div className="member-line-profile-grid">
                <div className="member-line-field">
                  <label htmlFor="line-name">Display name</label>
                  <input
                    id="line-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="member-line-field">
                  <label htmlFor="line-phone">Phone</label>
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
                    Email <MemberLineLock />
                  </label>
                  {/* Some older user docs lack an email field — fall back to the auth account's. */}
                  <input id="line-email" value={user?.email || auth?.currentUser?.email || ''} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-role">
                    Role <MemberLineLock />
                  </label>
                  <input id="line-role" value={roleLabel} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-status">
                    Status <MemberLineLock />
                  </label>
                  <input id="line-status" value={user?.status === 'active' ? 'Active' : 'Inactive'} readOnly />
                </div>
                <div className="member-line-field locked">
                  <label htmlFor="line-hire">
                    Member since <MemberLineLock />
                  </label>
                  <input id="line-hire" value={formatDate(user?.hireDate)} readOnly />
                </div>
                <div className="member-line-field locked full">
                  <label htmlFor="line-address">
                    Address <MemberLineLock />
                  </label>
                  <input id="line-address" value={fullAddress} readOnly />
                </div>
              </div>

              <dl className="member-line-details">
                <div>
                  <dt>Member since</dt>
                  <dd>{formatShortDate(user?.createdAt)}</dd>
                </div>
                <div>
                  <dt>Territory</dt>
                  <dd>{user?.territoryId || 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Employee ID</dt>
                  <dd className="font-mono">{user?.uid ? user.uid.slice(-6) : 'Not available'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{user?.status === 'active' ? 'Active' : 'Inactive'}</dd>
                </div>
              </dl>

              <div className="member-line-actions">
                <button
                  type="button"
                  className="member-line-button primary small"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <span className="member-line-status-text">
                  Contact your admin for role, territory, or address changes.
                </span>
              </div>
              <p className="member-line-sensitive-note">Don&apos;t enter card numbers or SSNs here.</p>
            </section>

          </div>

          <aside className="member-line-stack">
            {/* Change password panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <h2>Change password</h2>
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

            {/* App and theme panel */}
            <section className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <h2>App and theme</h2>
                </div>
              </div>
              <InstallAppCard />
              <PushNotificationsCard />
              <ThemeToggleCard />
            </section>

          </aside>
        </div>
        <ReportBugCard />
      </MemberLineShell>
    </ProtectedRoute>
  );
}
