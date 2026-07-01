'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, Clock3, ExternalLink, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  CALL_DAY_ORDER,
  CallAudience,
  CallAudienceLabels,
  CallDay,
  CallDayLabels,
} from '@/types';

interface CallEntry {
  id: string;
  title: string;
  description: string;
  day: CallDay;
  time: string;
  timezone: string;
  meetLink: string;
  audience: CallAudience;
  createdByName: string;
}

interface CallsResponse {
  calls: CallEntry[];
  canManage: boolean;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  day: 'monday' as CallDay,
  time: '09:00',
  timezone: 'America/Chicago',
  meetLink: '',
  audience: 'all' as CallAudience,
};

const REQUIRED_CALLS = [
  {
    title: 'Onboarding Call',
    description: 'New rep orientation and paperwork expectations.',
    day: 'monday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Day 1 Training Call',
    description: 'Intro to online training and first-day expectations.',
    day: 'monday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Day 2 Pitch Practice',
    description: 'Live pitch repetitions and coaching.',
    day: 'tuesday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Day 3 Rebuttals and Closing Practice',
    description: 'Objection handling, closing language, and manager feedback.',
    day: 'wednesday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Team Call - Beginning of Week',
    description: 'Monday team priorities, goals, and field updates.',
    day: 'monday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Team Call - Midweek',
    description: 'Thursday check-in on production, blockers, and follow-up.',
    day: 'thursday' as CallDay,
    audience: 'all' as CallAudience,
  },
  {
    title: 'Manager Call',
    description: 'Manager-only alignment on rep readiness and field support.',
    day: 'monday' as CallDay,
    audience: 'managers' as CallAudience,
  },
  {
    title: 'IBO Call',
    description: 'IBO-specific operating guidance and business-owner updates.',
    day: 'monday' as CallDay,
    audience: 'managers' as CallAudience,
  },
];

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export default function CallsSchedulePage() {
  const { user } = useAuth();
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/calls?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load call schedule');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call schedule');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleCreate = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/portal/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          createdBy: user.uid,
          createdByName: user.displayName || user.email,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to add call');
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add call');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (call: CallEntry) => {
    if (!user) return;
    setDeletingId(call.id);
    setError('');
    try {
      const response = await fetch('/api/portal/calls', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, requestedBy: user.uid }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to remove call');
      await fetchCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove call');
    } finally {
      setDeletingId(null);
    }
  };

  const byDay = CALL_DAY_ORDER.map((day) => ({
    day,
    calls: (data?.calls ?? []).filter((call) => call.day === day),
  })).filter((group) => group.calls.length > 0);

  const applyRequiredCall = (call: (typeof REQUIRED_CALLS)[number]) => {
    setForm({
      ...EMPTY_FORM,
      title: call.title,
      description: call.description,
      day: call.day,
      audience: call.audience,
    });
    setShowForm(true);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                        Calls Schedule
                      </h1>
                      <Badge variant="outline" className="rounded-md border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1d] dark:text-green-300">
                        Live cadence
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                      Recurring onboarding, training, team, manager, and IBO calls with confirmed Meet links.
                    </p>
                  </div>
                  {data?.canManage && (
                    <Button
                      onClick={() => setShowForm(true)}
                      className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                    >
                      <Plus className="size-4" />
                      Add Call
                    </Button>
                  )}
                </div>
              </section>

              {error && (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading ? (
                <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ) : byDay.length === 0 ? (
                <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                        <CalendarClock className="size-5" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-950 dark:text-foreground">
                          Call schedule not published yet
                        </h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
                          {data?.canManage
                            ? 'Leadership listed the required cadence below. Add each call once the Meet link and exact time are confirmed.'
                            : 'Management is still confirming the recurring call times and Meet links.'}
                        </p>
                      </div>
                    </div>
                    {data?.canManage && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {REQUIRED_CALLS.map((call) => (
                          <button
                            key={call.title}
                            onClick={() => applyRequiredCall(call)}
                            className="cursor-pointer rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-3 text-left transition-[border-color,background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/70 hover:bg-[#8dc63f]/5 motion-reduce:transform-none"
                          >
                            <p className="text-sm font-semibold text-slate-950 dark:text-foreground">{call.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                              {CallDayLabels[call.day]} - {CallAudienceLabels[call.audience]}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                byDay.map(({ day, calls }) => (
                  <section key={day} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-muted-foreground">
                        {CallDayLabels[day]}
                      </h2>
                      <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground">
                        {calls.length} call{calls.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <div className="grid gap-3">
                      {calls.map((call) => (
                        <Card
                          key={call.id}
                          className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/60 hover:shadow-md motion-reduce:transform-none"
                        >
                          <CardContent className="p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex gap-4">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                                  {call.audience === 'managers' ? <ShieldCheck className="size-5" /> : <Users className="size-5" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-slate-950 dark:text-foreground">{call.title}</h3>
                                    <Badge
                                      variant="outline"
                                      className={
                                        call.audience === 'managers'
                                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                                          : 'border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-slate-600 dark:text-muted-foreground'
                                      }
                                    >
                                      {CallAudienceLabels[call.audience]}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-muted-foreground">
                                    <Clock3 className="size-4 text-slate-400 dark:text-muted-foreground" />
                                    {formatTime(call.time)}
                                    {call.timezone ? ` (${call.timezone})` : ''} / every {CallDayLabels[call.day]}
                                  </p>
                                  {call.description && (
                                    <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">{call.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button asChild className="bg-[#0A1F44] text-white hover:bg-[#13294f]">
                                  <a href={call.meetLink} target="_blank" rel="noopener noreferrer">
                                    Join Meet
                                    <ExternalLink className="size-4" />
                                  </a>
                                </Button>
                                {data?.canManage && (
                                  <Button
                                    variant="outline"
                                    onClick={() => handleDelete(call)}
                                    disabled={deletingId === call.id}
                                    className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                                  >
                                    <Trash2 className="size-4" />
                                    {deletingId === call.id ? 'Removing...' : 'Remove'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) setForm(EMPTY_FORM);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[#0A1F44] dark:text-foreground">Add Recurring Call</DialogTitle>
            <DialogDescription>
              Use the required-call starters when possible, then confirm the exact time and Meet link.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-muted-foreground">
              Leadership call list
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REQUIRED_CALLS.map((call) => (
                <Button
                  key={call.title}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => applyRequiredCall(call)}
                  className="bg-white dark:bg-card"
                >
                  {call.title}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="call-title">Title</Label>
              <Input
                id="call-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Morning Huddle"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="call-day">Day</Label>
                <NativeSelect
                  id="call-day"
                  value={form.day}
                  onChange={(event) => setForm({ ...form, day: event.target.value as CallDay })}
                  className="w-full bg-white dark:bg-card"
                >
                  {CALL_DAY_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {CallDayLabels[day]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="call-time">Time</Label>
                <Input
                  id="call-time"
                  type="time"
                  value={form.time}
                  onChange={(event) => setForm({ ...form, time: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="call-link">Google Meet Link</Label>
              <Input
                id="call-link"
                type="url"
                value={form.meetLink}
                onChange={(event) => setForm({ ...form, meetLink: event.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="call-audience">Audience</Label>
              <NativeSelect
                id="call-audience"
                value={form.audience}
                onChange={(event) => setForm({ ...form, audience: event.target.value as CallAudience })}
                className="w-full bg-white dark:bg-card"
              >
                {(Object.keys(CallAudienceLabels) as CallAudience[]).map((audience) => (
                  <option key={audience} value={audience}>
                    {CallAudienceLabels[audience]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="call-description">Description</Label>
              <Textarea
                id="call-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                placeholder="What this call covers..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.title.trim() || !form.meetLink.trim()}
              className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
            >
              {saving ? 'Adding...' : 'Add Call'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
