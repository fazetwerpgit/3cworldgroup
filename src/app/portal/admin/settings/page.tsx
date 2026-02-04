'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface SystemSettings {
  pointsPerSale: {
    min: number;
    max: number;
    default: number;
  };
  autoApprove: boolean;
  defaultRole: string;
  leaderboardPeriods: string[];
  companyName: string;
  supportEmail: string;
}

export default function AdminSettingsPage() {
  const { isRole } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    pointsPerSale: { min: 1, max: 15, default: 5 },
    autoApprove: true,
    defaultRole: 'sales_rep',
    leaderboardPeriods: ['week', 'month', 'quarter', 'year'],
    companyName: '3C World Group',
    supportEmail: 'support@3cworldgroup.com',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'sales' | 'notifications'>('general');

  const isAdmin = isRole('admin');

  const handleSave = async () => {
    setSaving(true);
    // Simulate save - in production this would call an API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSuccess('Settings saved successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 p-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-white font-semibold text-lg">Access Denied</p>
          <p className="text-white/60 mt-1">Only admins can access system settings.</p>
          <Link
            href="/portal/dashboard"
            className="inline-block mt-4 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e]"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">System Settings</h1>
          <p className="text-white/60 text-sm">Configure system-wide settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 bg-[#8dc63f] text-white rounded-xl font-medium hover:bg-[#7ab82e] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_0_20px_rgba(141,198,63,0.4)] transition-all"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-[#8dc63f]/20 text-[#8dc63f] px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-[#8dc63f]/30">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      {/* Tabs - Dark Theme */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 overflow-hidden">
        <div className="flex border-b border-white/10 overflow-x-auto">
          {[
            { id: 'general', label: 'General', icon: '⚙️' },
            { id: 'sales', label: 'Sales & Points', icon: '💰' },
            { id: 'notifications', label: 'Notifications', icon: '🔔' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 min-w-[100px] px-4 sm:px-6 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'text-[#8dc63f] border-b-2 border-[#8dc63f] bg-[#8dc63f]/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Support Email
                </label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Default Role for New Users
                </label>
                <select
                  value={settings.defaultRole}
                  onChange={(e) => setSettings({ ...settings, defaultRole: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                >
                  <option value="sales_rep" className="bg-gray-800">Sales Representative</option>
                  <option value="sales_manager" className="bg-gray-800">Sales Manager</option>
                  <option value="operations" className="bg-gray-800">Operations</option>
                </select>
                <p className="text-xs text-white/40 mt-2">
                  New users who sign up will be assigned this role by default
                </p>
              </div>
            </div>
          )}

          {/* Sales & Points Settings */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <div>
                  <h3 className="font-medium text-white">Auto-Approve Sales</h3>
                  <p className="text-sm text-white/50">
                    Automatically approve sales when submitted
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoApprove: !settings.autoApprove })}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    settings.autoApprove ? 'bg-[#8dc63f]' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${
                      settings.autoApprove ? 'left-8' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-4">
                  Points Per Sale Range
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="block text-xs text-white/50 mb-2 font-medium">Minimum</label>
                    <input
                      type="number"
                      value={settings.pointsPerSale.min}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: { ...settings.pointsPerSale, min: parseInt(e.target.value) },
                        })
                      }
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="block text-xs text-white/50 mb-2 font-medium">Maximum</label>
                    <input
                      type="number"
                      value={settings.pointsPerSale.max}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: { ...settings.pointsPerSale, max: parseInt(e.target.value) },
                        })
                      }
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="bg-[#8dc63f]/10 rounded-xl p-4 border border-[#8dc63f]/30">
                    <label className="block text-xs text-[#8dc63f] mb-2 font-medium">Default</label>
                    <input
                      type="number"
                      value={settings.pointsPerSale.default}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: { ...settings.pointsPerSale, default: parseInt(e.target.value) },
                        })
                      }
                      className="w-full px-4 py-2.5 bg-[#8dc63f]/10 border border-[#8dc63f]/30 rounded-lg text-white focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/40 mt-3">
                  Points are assigned based on the fiber plan selected (1-15 pts)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-3">
                  Leaderboard Time Periods
                </label>
                <div className="flex flex-wrap gap-2">
                  {['day', 'week', 'month', 'quarter', 'year', 'all_time'].map((period) => {
                    const isSelected = settings.leaderboardPeriods.includes(period);
                    return (
                      <button
                        key={period}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSettings({
                              ...settings,
                              leaderboardPeriods: settings.leaderboardPeriods.filter((p) => p !== period),
                            });
                          } else {
                            setSettings({
                              ...settings,
                              leaderboardPeriods: [...settings.leaderboardPeriods, period],
                            });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-[#8dc63f] text-white shadow-lg shadow-[#8dc63f]/20'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
                        }`}
                      >
                        {period.replace('_', ' ').charAt(0).toUpperCase() + period.slice(1).replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Notifications Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-3">
              {[
                { id: 'newSale', label: 'New Sale Submitted', description: 'Notify when a new sale is logged', enabled: true },
                { id: 'saleApproved', label: 'Sale Approved', description: 'Notify reps when their sale is approved', enabled: true },
                { id: 'saleRejected', label: 'Sale Rejected', description: 'Notify reps when their sale is rejected', enabled: true },
                { id: 'leaderboardUpdate', label: 'Leaderboard Changes', description: 'Notify when ranking changes', enabled: false },
                { id: 'newAchievement', label: 'Achievement Unlocked', description: 'Notify when badges are earned', enabled: true },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-all">
                  <div>
                    <h3 className="font-medium text-white">{item.label}</h3>
                    <p className="text-sm text-white/50">{item.description}</p>
                  </div>
                  <button className={`relative w-14 h-7 rounded-full transition-colors ${item.enabled ? 'bg-[#8dc63f]' : 'bg-white/20'}`}>
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${item.enabled ? 'left-8' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone - Dark Theme */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-red-500/30 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-red-500/10 border-b border-red-500/30">
          <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
            <span>⚠️</span> Danger Zone
          </h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-red-500/20 rounded-xl bg-red-500/5">
            <div>
              <h3 className="font-medium text-white">Reset All Sales Data</h3>
              <p className="text-sm text-white/50">
                Permanently delete all sales records. This cannot be undone.
              </p>
            </div>
            <button className="w-full sm:w-auto px-5 py-2.5 border-2 border-red-500 text-red-400 rounded-xl hover:bg-red-500 hover:text-white font-medium transition-all">
              Reset Sales
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-red-500/20 rounded-xl bg-red-500/5">
            <div>
              <h3 className="font-medium text-white">Reset Leaderboard</h3>
              <p className="text-sm text-white/50">
                Clear all leaderboard rankings and start fresh.
              </p>
            </div>
            <button className="w-full sm:w-auto px-5 py-2.5 border-2 border-red-500 text-red-400 rounded-xl hover:bg-red-500 hover:text-white font-medium transition-all">
              Reset Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
