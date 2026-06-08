'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

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

  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
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

    // Validate passwords
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
        body: JSON.stringify({
          userId: user.uid,
          displayName,
          phone,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      await refreshUser();
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDisplayName(user?.displayName || '');
    setPhone(user?.phone || '');
  };

  // Effective role handles legacy docs that resolve to fieldRole-only;
  // labels come from the shared RoleDisplayNames map.
  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : '';

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      operations: 'bg-blue-100 text-blue-800',
      l1_manager: 'bg-green-100 text-green-800',
      l2_manager: 'bg-green-100 text-green-800',
      entry_rep: 'bg-gray-100 text-gray-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1100px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Account Settings
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  Manage your profile, password, and account details used inside the employee portal.
                </p>
              </section>

              {/* Success/Error Messages */}
              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {success}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Profile Information */}
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-[#0A1F44]">
                    Profile Information
                  </h2>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1 text-sm font-medium text-[#5a8f1f] hover:text-[#4a7c19]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="rounded-md bg-[#8dc63f] px-3 py-1 text-sm font-medium text-[#0A1F44] hover:bg-[#7ab82e] disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[#8dc63f] shadow-sm">
                      <span className="text-3xl font-bold text-[#0A1F44]">
                        {user?.displayName?.charAt(0).toUpperCase() ||
                          user?.email?.charAt(0).toUpperCase() ||
                          'U'}
                      </span>
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                          />
                          <p className="text-sm text-gray-500">{user?.email}</p>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-semibold text-gray-900">
                            {user?.displayName || 'Set your name'}
                          </h3>
                          <p className="text-sm text-gray-500">{user?.email}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Role
                      </label>
                      <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getRoleBadgeColor(effectiveRole || '')}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Status
                      </label>
                      <span
                        className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                          user?.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user?.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Phone
                      </label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(555) 123-4567"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                        />
                      ) : (
                        <p className="text-gray-900">{user?.phone || 'Not set'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Hire Date
                      </label>
                      <p className="text-gray-900">
                        {formatDate(user?.hireDate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">
                  Security
                </h2>
                <div className="space-y-4">
                  {/* Change Password */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#0A1F44] rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-950">Change Password</h3>
                          <p className="text-sm text-slate-500">
                            Update your password directly
                          </p>
                        </div>
                      </div>
                      {!showPasswordForm && (
                        <button
                          onClick={() => setShowPasswordForm(true)}
                          className="rounded-md bg-[#8dc63f] px-4 py-2 text-sm font-medium text-[#0A1F44] transition-colors hover:bg-[#7ab82e]"
                        >
                          Change Password
                        </button>
                      )}
                    </div>

                    {/* Password Change Form */}
                    {showPasswordForm && (
                      <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Current Password
                          </label>
                          <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                            placeholder="Enter current password"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            New Password
                          </label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                            placeholder="Enter new password (min 6 characters)"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm New Password
                          </label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                            placeholder="Confirm new password"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="submit"
                            disabled={changingPassword}
                            className="rounded-md bg-[#8dc63f] px-4 py-2 text-sm font-medium text-[#0A1F44] transition-colors hover:bg-[#7ab82e] disabled:opacity-50"
                          >
                            {changingPassword ? 'Changing...' : 'Update Password'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowPasswordForm(false);
                              setCurrentPassword('');
                              setNewPassword('');
                              setConfirmPassword('');
                              setError('');
                            }}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Reset Password via Email */}
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-400 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-950">Reset via Email</h3>
                        <p className="text-sm text-slate-500">
                          Forgot your password? Get a reset link
                        </p>
                      </div>
                    </div>
                    {resetSent ? (
                      <span className="flex items-center gap-1 text-sm text-emerald-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Email sent!
                      </span>
                    ) : (
                      <button
                        onClick={handlePasswordReset}
                        disabled={loading}
                        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        {loading ? 'Sending...' : 'Send Reset Link'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Account Info */}
              <div className="rounded-lg border border-[#0A1F44]/15 bg-[#0A1F44] p-6 text-white">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Need to change your role or other details?</h3>
                    <p className="text-white/70 text-sm">
                      Contact your administrator or operations team for changes to your role,
                      territory, or other account-level settings.
                    </p>
                  </div>
                </div>
              </div>

              {/* Account Stats */}
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">
                  Account Details
                </h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-4 text-center">
                    <p className="text-2xl font-bold text-[#0A1F44]">{formatDate(user?.createdAt).split(',')[0]}</p>
                    <p className="text-xs text-gray-500 mt-1">Member Since</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4 text-center">
                    <p className="text-2xl font-bold text-[#0A1F44]">{user?.territoryId || '--'}</p>
                    <p className="text-xs text-gray-500 mt-1">Territory</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4 text-center">
                    <p className="text-2xl font-bold text-[#8dc63f]">{user?.uid?.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-gray-500 mt-1">Employee ID</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4 text-center">
                    <p className="text-2xl font-bold text-[#0A1F44]">
                      {user?.status === 'active' ? 'Yes' : 'No'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Account Active</p>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
