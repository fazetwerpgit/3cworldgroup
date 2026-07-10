'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Check, Lock, Settings, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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

type SettingsTab = 'general' | 'sales' | 'notifications';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings className="h-4 w-4" /> },
  {
    id: 'sales',
    label: 'Sales & Points',
    icon: <SlidersHorizontal className="h-4 w-4" />,
  },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
];

export default function AdminSettingsPage() {
  const { isRole } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    pointsPerSale: { min: 1, max: 15, default: 5 },
    autoApprove: true,
    defaultRole: 'entry_level_rep',
    leaderboardPeriods: ['week', 'month', 'quarter', 'year'],
    companyName: '3C World Group',
    supportEmail: 'support@3cworldgroup.com',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const isAdmin = isRole('admin');

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSuccess('Settings saved');
    setTimeout(() => setSuccess(''), 3000);
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5">
        <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 text-center shadow-sm">
          <CardContent className="py-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold text-slate-950 dark:text-foreground">Access Denied</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
              Only admins can access system settings.
            </p>
            <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PortalPageHeader
        compact
        eyebrow="Administration"
        title="System Settings"
        description="Configure portal defaults used by operations and field teams."
        actions={
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-[#0A1F44]" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        }
      />

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-4 py-3 text-sm text-[#4f7f1e] dark:text-green-300">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      <Card className="portal-enter portal-enter-2 overflow-hidden rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-muted">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-[130px] flex-1 cursor-pointer items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[#8dc63f] bg-white dark:bg-card text-[#0A1F44] dark:text-foreground'
                  : 'text-slate-600 dark:text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-slate-950 dark:hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <CardContent className="p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Company Name
                </label>
                <Input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) =>
                    setSettings({ ...settings, companyName: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Support Email
                </label>
                <Input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, supportEmail: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Default Role for New Users
                </label>
                <NativeSelect
                  value={settings.defaultRole}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultRole: e.target.value })
                  }
                  className="w-full"
                >
                  <NativeSelectOption value="entry_level_rep">
                    Entry Level Rep
                  </NativeSelectOption>
                  <NativeSelectOption value="entry_rep">
                    Account Executive
                  </NativeSelectOption>
                  <NativeSelectOption value="l1_manager">L1 Manager</NativeSelectOption>
                  <NativeSelectOption value="l2_manager">L2 Manager</NativeSelectOption>
                  <NativeSelectOption value="operations">Operations</NativeSelectOption>
                </NativeSelect>
                <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                  New users who sign up will be assigned this role by default.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                <div>
                  <h3 className="font-medium text-slate-950 dark:text-foreground">Auto-Approve Sales</h3>
                  <p className="text-sm text-slate-500 dark:text-muted-foreground">
                    Automatically approve sales when submitted.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, autoApprove: !settings.autoApprove })
                  }
                  className={`relative h-7 w-14 cursor-pointer rounded-full transition-colors ${
                    settings.autoApprove ? 'bg-[#8dc63f]' : 'bg-slate-300 dark:bg-muted'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white dark:bg-card shadow-sm transition-transform ${
                      settings.autoApprove ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-4 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Points Per Sale Range
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                      Minimum
                    </label>
                    <Input
                      type="number"
                      value={settings.pointsPerSale.min}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: {
                            ...settings.pointsPerSale,
                            min: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                      Maximum
                    </label>
                    <Input
                      type="number"
                      value={settings.pointsPerSale.max}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: {
                            ...settings.pointsPerSale,
                            max: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-lg border border-[#8dc63f]/40 bg-[#8dc63f]/10 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#4f7f1e] dark:text-green-300">
                      Default
                    </label>
                    <Input
                      type="number"
                      value={settings.pointsPerSale.default}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          pointsPerSale: {
                            ...settings.pointsPerSale,
                            default: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-muted-foreground">
                  Points are assigned based on the fiber plan selected.
                </p>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Leaderboard Time Periods
                </label>
                <div className="flex flex-wrap gap-2">
                  {['day', 'week', 'month', 'quarter', 'year', 'all_time'].map(
                    (period) => {
                      const isSelected = settings.leaderboardPeriods.includes(period);
                      return (
                        <Button
                          key={period}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => {
                            if (isSelected) {
                              setSettings({
                                ...settings,
                                leaderboardPeriods:
                                  settings.leaderboardPeriods.filter((p) => p !== period),
                              });
                            } else {
                              setSettings({
                                ...settings,
                                leaderboardPeriods: [
                                  ...settings.leaderboardPeriods,
                                  period,
                                ],
                              });
                            }
                          }}
                          className={
                            isSelected
                              ? 'bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]'
                              : ''
                          }
                        >
                          {period
                            .replace('_', ' ')
                            .replace(/\b\w/g, (char) => char.toUpperCase())}
                        </Button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-3">
              {[
                {
                  id: 'newSale',
                  label: 'New Sale Submitted',
                  description: 'Notify managers when a new sale is logged.',
                  enabled: true,
                },
                {
                  id: 'saleApproved',
                  label: 'Sale Approved',
                  description: 'Notify reps when their sale is approved.',
                  enabled: true,
                },
                {
                  id: 'saleRejected',
                  label: 'Sale Rejected',
                  description: 'Notify reps when their sale is rejected.',
                  enabled: true,
                },
                {
                  id: 'leaderboardUpdate',
                  label: 'Leaderboard Changes',
                  description: 'Notify reps when ranking changes.',
                  enabled: false,
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4 transition-colors hover:border-slate-300 dark:hover:border-border"
                >
                  <div>
                    <h3 className="font-medium text-slate-950 dark:text-foreground">{item.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-muted-foreground">{item.description}</p>
                  </div>
                  <button
                    type="button"
                    className={`relative h-7 w-14 cursor-pointer rounded-full transition-colors ${
                      item.enabled ? 'bg-[#8dc63f]' : 'bg-slate-300 dark:bg-muted'
                    }`}
                    aria-pressed={item.enabled}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white dark:bg-card shadow-sm transition-transform ${
                        item.enabled ? 'translate-x-8' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="portal-enter portal-enter-3 rounded-lg border-red-200 dark:border-red-500/30 bg-white dark:bg-card py-0 shadow-sm">
        <CardHeader className="border-b border-red-100 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/15 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-300">
            <ShieldAlert className="h-5 w-5" />
            Restricted Actions
          </h2>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col justify-between gap-4 rounded-lg border border-red-100 dark:border-red-500/30 bg-white dark:bg-card p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-medium text-slate-950 dark:text-foreground">Reset All Sales Data</h3>
              <p className="text-sm text-slate-500 dark:text-muted-foreground">
                Permanently delete all sales records. This cannot be undone.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-800 dark:hover:text-red-200"
            >
              Reset Sales
            </Button>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-lg border border-red-100 dark:border-red-500/30 bg-white dark:bg-card p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-medium text-slate-950 dark:text-foreground">Reset Leaderboard</h3>
              <p className="text-sm text-slate-500 dark:text-muted-foreground">
                Clear leaderboard rankings and restart the reporting period.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-800 dark:hover:text-red-200"
            >
              Reset Leaderboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
