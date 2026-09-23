'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ChevronDown, KeyRound, Lock } from 'lucide-react';
import ReportBugCard from '@/components/portal/ReportBugCard';
import ThemeToggleCard from '@/components/portal/ThemeToggleCard';
import InstallAppCard from '@/components/portal/InstallAppCard';
import PushNotificationsCard from '@/components/portal/PushNotificationsCard';
import { getEffectiveRole, repFacingRoleLabel } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

// The chrome (top bar, tab bar, auth gate) comes from ./layout.tsx: RepShell.

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
  // IBO roles are never named to reps: no Role row for them at all.
  const roleLabel = repFacingRoleLabel(effectiveRole);
  const showRole = !effectiveRole || roleLabel !== null;

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'Not on file';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatShortDate = (date: Date | string | undefined) => {
    if (!date) return 'Not available';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  const addressLine = [user?.city, user?.state].filter(Boolean).join(', ') + (user?.zip ? ` ${user.zip}` : '');
  const fullAddress = user?.address ? `${user.address}${addressLine ? `, ${addressLine}` : ''}` : addressLine || 'Not on file';
  const email = user?.email || auth?.currentUser?.email || '';
  const initials = (user?.displayName || email || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const facts: Array<[string, string]> = [
    // Some older user docs lack an email field — fall back to the auth account's.
    ['Email', email || 'Not on file'],
    ...(showRole ? [['Role', roleLabel || 'Not assigned'] as [string, string]] : []),
    ['Status', user?.status === 'active' ? 'Active' : 'Inactive'],
    ['Start date', formatDate(user?.hireDate)],
    ['Member since', formatShortDate(user?.createdAt)],
    ['Territory', user?.territoryId || 'Not assigned'],
    ['Employee ID', user?.uid ? user.uid.slice(-6) : 'Not available'],
    ['Address', fullAddress],
  ];

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>Settings</h1>
      </header>

      {success && (
        <div className={`${p.notice} ${p.noticeLime}`} role="status">
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className={`${p.notice} ${p.noticeRed}`} role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className={st.layout}>
        <div className={st.col}>
          <section className={s.panel} aria-labelledby="profile-title">
            <div className={s.panelHead}>
              <h2 id="profile-title" className={s.kicker}>Your profile</h2>
            </div>
            <div className={st.who}>
              <span className={st.initials} aria-hidden="true">{initials}</span>
              <div>
                <p className={st.whoName}>{user?.displayName || 'Member'}</p>
                {email ? <p className={st.whoSub}>{email}</p> : null}
              </div>
            </div>

            <form
              className={st.form}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveProfile();
              }}
            >
              <div className={st.fields}>
                <label className={p.field}>
                  <span className={p.label}>Display name</span>
                  <input id="line-name" className={p.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
                </label>
                <label className={p.field}>
                  <span className={p.label}>Phone</span>
                  <input
                    id="line-phone"
                    className={p.input}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    autoComplete="tel"
                  />
                </label>
              </div>
              <div className={st.saveRow}>
                <button type="submit" className={s.btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <p className={p.hint}>Don&apos;t enter card numbers or SSNs here.</p>
              </div>
            </form>

            <dl className={st.facts}>
              {facts.map(([label, value]) => (
                <div className={st.fact} key={label}>
                  <dt>
                    <Lock size={12} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className={st.factsNote}>
              <p className={p.hint}>Locked details come from your admin. Ask them to change your role, territory or address.</p>
            </div>
          </section>
        </div>

        <div className={st.col}>
          <section className={s.panel} aria-labelledby="app-title">
            <div className={s.panelHead}>
              <h2 id="app-title" className={s.kicker}>Notifications and app</h2>
            </div>
            <PushNotificationsCard />
            <InstallAppCard />
          </section>

          <section className={s.panel} aria-labelledby="theme-title">
            <div className={s.panelHead}>
              <h2 id="theme-title" className={s.kicker}>Theme</h2>
            </div>
            <ThemeToggleCard />
          </section>

          <section className={s.panel} aria-label="Password">
            <button
              type="button"
              className={st.toggle}
              aria-expanded={showPasswordForm}
              onClick={() => (showPasswordForm ? closePasswordForm() : setShowPasswordForm(true))}
            >
              <span>
                <KeyRound size={20} aria-hidden="true" />
                Change password
              </span>
              <ChevronDown size={18} className={st.toggleChev} aria-hidden="true" />
            </button>
            {showPasswordForm && (
              <div className={st.drawer}>
                <form onSubmit={handleChangePassword} className={st.stack}>
                  <label className={p.field}>
                    <span className={p.label}>Current password</span>
                    <input
                      id="line-current"
                      className={p.input}
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label className={p.field}>
                    <span className={p.label}>New password</span>
                    <input
                      id="line-new"
                      className={p.input}
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label className={p.field}>
                    <span className={p.label}>Confirm new password</span>
                    <input
                      id="line-confirm"
                      className={p.input}
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </label>
                  <div className={st.actions}>
                    <button type="button" className={s.btnSecondary} onClick={closePasswordForm}>
                      Cancel
                    </button>
                    <button type="submit" className={s.btnPrimary} disabled={changingPassword}>
                      {changingPassword ? 'Updating…' : 'Update password'}
                    </button>
                  </div>
                </form>
                {resetSent ? (
                  <p className={p.hint} role="status">Reset email sent. Check your inbox.</p>
                ) : (
                  <button type="button" className={st.linkBtn} onClick={handlePasswordReset} disabled={loading}>
                    {loading ? 'Sending…' : 'Email me a reset link instead'}
                  </button>
                )}
              </div>
            )}
          </section>

          <ReportBugCard />
        </div>
      </div>
    </div>
  );
}
