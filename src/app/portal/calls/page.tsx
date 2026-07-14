'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarClock, Check, ExternalLink, Plus, ShieldCheck, Users } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  description?: string;
  day: CallDay;
  time: string;
  timezone: string;
  meetLink: string;
  audience: CallAudience;
  createdByName?: string;
}

interface CallsResponse {
  calls: CallEntry[];
  canManage: boolean;
}

interface CentralNow {
  day: CallDay;
  minutes: number;
}

const CENTRAL_TIME_ZONE = 'America/Chicago';
const CALL_DAY_SHORT: Record<CallDay, string> = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  day: 'monday' as CallDay,
  time: '09:00',
  timezone: CENTRAL_TIME_ZONE,
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

const CALL_STARTERS = [
  {
    label: 'Manager Sync',
    title: 'Manager Sync',
    day: 'monday' as CallDay,
    time: '16:30',
    audience: 'managers' as CallAudience,
    description: 'Pipeline, coaching, and field blockers.',
  },
  {
    label: 'IBO Leadership',
    title: 'IBO Leadership Call',
    day: 'wednesday' as CallDay,
    time: '08:30',
    audience: 'managers' as CallAudience,
    description: 'Leadership priorities and recruiting pulse.',
  },
  {
    label: 'New Rep Onboarding',
    title: 'New Rep Onboarding',
    day: 'monday' as CallDay,
    time: '10:00',
    audience: 'all' as CallAudience,
    description: 'First-week setup, scripts, and ride alongs.',
  },
];

const CENTRAL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIME_ZONE,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCentralNow(date = new Date()): CentralNow {
  const parts = Object.fromEntries(CENTRAL_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]));
  const day = parts.weekday.toLowerCase() as CallDay;
  const hour = Number(parts.hour) % 24;
  return { day, minutes: hour * 60 + Number(parts.minute) };
}

function getMinutesUntil(call: CallEntry, now: CentralNow): number {
  const todayIndex = CALL_DAY_ORDER.indexOf(now.day);
  const callIndex = CALL_DAY_ORDER.indexOf(call.day);
  let minutes = ((callIndex - todayIndex + CALL_DAY_ORDER.length) % CALL_DAY_ORDER.length) * 1440;
  minutes += timeToMinutes(call.time) - now.minutes;
  if (minutes <= 0) minutes += CALL_DAY_ORDER.length * 1440;
  return minutes;
}

function isPastOccurrence(call: CallEntry, now: CentralNow): boolean {
  return call.day === now.day && timeToMinutes(call.time) < now.minutes;
}

function formatCountdown(minutes: number | null): string {
  if (minutes === null) return 'IN —';
  return `IN ${Math.floor(minutes / 60)}H ${minutes % 60}M`;
}

function CallsSkeleton() {
  return (
    <div className="calls-line-skeleton" aria-label="Loading calls schedule">
      <div className="calls-line-skeleton-command">
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-kicker" />
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-title" />
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-copy" />
      </div>
      <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-broadcast" />
      <div className="calls-line-skeleton-section">
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-section-head" />
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-week" />
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-card" />
        <Skeleton className="calls-line-skeleton-bar calls-line-skeleton-card" />
      </div>
    </div>
  );
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
  const [selectedDay, setSelectedDay] = useState<CallDay>(() => getCentralNow().day);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  const now = getCentralNow(new Date(nowTick));
  const calls = data?.calls ?? [];
  const orderedCalls = [...calls].sort((a, b) => {
    const dayOrder = CALL_DAY_ORDER.indexOf(a.day) - CALL_DAY_ORDER.indexOf(b.day);
    return dayOrder || a.time.localeCompare(b.time);
  });
  const todayCalls = orderedCalls.filter((call) => call.day === now.day);
  const selectedCalls = orderedCalls
    .filter((call) => call.day === selectedDay)
    .sort((a, b) => a.time.localeCompare(b.time));
  const nextCall = [...orderedCalls].sort((a, b) => getMinutesUntil(a, now) - getMinutesUntil(b, now))[0];
  const nextCallMinutes = nextCall ? getMinutesUntil(nextCall, now) : null;
  const scheduleIsEmpty = calls.length === 0;

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

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

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

  const applyStarter = (starter: (typeof CALL_STARTERS)[number]) => {
    setForm({
      ...EMPTY_FORM,
      title: starter.title,
      description: starter.description,
      day: starter.day,
      time: starter.time,
      audience: starter.audience,
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="calls-line-main flex-1 overflow-auto">
            <div className="calls-line">
              <header className="calls-line-mast">
                <span className="calls-line-mark">3C WORLD GROUP / THE LINE</span>
                <span className="calls-line-mast-meta">Calls broadcast · America/Chicago</span>
              </header>

              {error && (
                <Alert className="calls-line-alert">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading ? (
                <CallsSkeleton />
              ) : (
                <>
                  <section className="calls-line-command">
                    <div className="calls-line-command-top">
                      <div>
                        <p className="calls-line-eyebrow">03 / The Line / recurring calls</p>
                        <h1>
                          {todayCalls.length} calls on the board <span>today.</span>
                        </h1>
                        <p className="calls-line-context">
                          A single priority-ordered flow for the floor. The next signal is fused into the masthead; the full week stays below as a clean ledger.
                        </p>
                      </div>
                      <div className="calls-line-hero-number">
                        <strong className="calls-line-hero-display portal-metallic-num">{todayCalls.length}</strong>
                        <small>visible calls · {CallDayLabels[now.day]}</small>
                      </div>
                    </div>

                    <div className="calls-line-broadcast" aria-label="Next call">
                      <span className="calls-line-broadcast-label">Next call</span>
                      <div>
                        <strong className="calls-line-broadcast-title">{nextCall?.title ?? 'No upcoming calls'}</strong>
                        <span className="calls-line-broadcast-meta">
                          {nextCall ? `${formatTime(nextCall.time)} CT · ${CallAudienceLabels[nextCall.audience]}` : '—'}
                        </span>
                      </div>
                      <strong className="calls-line-countdown">{formatCountdown(nextCallMinutes)}</strong>
                      <span className="calls-line-broadcast-arrow" aria-hidden="true"><ArrowRight /></span>
                      {nextCall ? (
                        <a className="calls-line-join" href={nextCall.meetLink} target="_blank" rel="noreferrer">
                          <ExternalLink aria-hidden="true" />
                          Join Meet
                        </a>
                      ) : (
                        <span className="calls-line-join calls-line-join-disabled">Join Meet</span>
                      )}
                    </div>
                  </section>

                  {data?.canManage && (
                    <div className="calls-line-manage-bar">
                      <p><strong>Operations desk</strong><br />Admin / operations view · management calls and recurrence controls visible.</p>
                      <button className="calls-line-add-call" onClick={() => setShowForm(true)} type="button">
                        <Plus aria-hidden="true" />
                        Add Call
                      </button>
                    </div>
                  )}

                  <section className="calls-line-air-times">
                    <div className="calls-line-section-head">
                      <div>
                        <p className="calls-line-eyebrow">Week strip / select a broadcast day</p>
                        <h2>Air times</h2>
                      </div>
                      <p>{CallDayLabels[selectedDay]} selected</p>
                    </div>

                    <div className="calls-line-week-strip" role="tablist" aria-label="Select broadcast day">
                      {CALL_DAY_ORDER.map((day) => {
                        const dayCount = calls.filter((call) => call.day === day).length;
                        return (
                          <button
                            key={day}
                            className={`calls-line-day-tab ${dayCount === 0 ? 'empty' : ''}`}
                            type="button"
                            role="tab"
                            aria-selected={selectedDay === day}
                            onClick={() => setSelectedDay(day)}
                          >
                            <span className="calls-line-day-dow">{CALL_DAY_SHORT[day]}</span>
                            <span className="calls-line-day-date">{day === now.day ? 'TODAY' : CallDayLabels[day]}</span>
                            <span className="calls-line-day-count">{dayCount} CALL{dayCount === 1 ? '' : 'S'}</span>
                            <i className="calls-line-day-mark" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>

                    <div className="calls-line-air-pane">
                      <div className="calls-line-pane-head">
                        <h3>{CallDayLabels[selectedDay]} {selectedDay === now.day && <span>/ today</span>}</h3>
                        <p>{selectedCalls.length} visible call{selectedCalls.length === 1 ? '' : 's'} · America/Chicago</p>
                      </div>

                      {selectedCalls.length > 0 ? (
                        <div className="calls-line-broadcast-cards">
                          {selectedCalls.map((call) => {
                            const past = isPastOccurrence(call, now);
                            return (
                              <article className={`calls-line-air-card ${past ? 'past' : ''}`} key={call.id}>
                                <div className="calls-line-air-time">
                                  <strong>{formatTime(call.time)}</strong>
                                  <small>AMERICA / CHICAGO<br />{past ? 'COMPLETED' : 'ON AIR'}</small>
                                </div>
                                <div className="calls-line-air-copy">
                                  <h4>{call.title}</h4>
                                  <span className={`calls-line-audience ${call.audience === 'managers' ? 'manager' : ''}`}>
                                    {call.audience === 'managers' ? <ShieldCheck aria-hidden="true" /> : <Users aria-hidden="true" />}
                                    {CallAudienceLabels[call.audience]}
                                  </span>
                                  <p>{call.description || 'Recurring team call.'}</p>
                                  <div className="calls-line-air-actions">
                                    {past ? (
                                      <span className="calls-line-done"><Check aria-hidden="true" />DONE</span>
                                    ) : (
                                      <a className="calls-line-join" href={call.meetLink} target="_blank" rel="noreferrer">
                                        <ExternalLink aria-hidden="true" />
                                        Join Meet
                                      </a>
                                    )}
                                    {data?.canManage && (
                                      <button
                                        className="calls-line-remove"
                                        type="button"
                                        onClick={() => handleDelete(call)}
                                        disabled={deletingId === call.id}
                                      >
                                        {deletingId === call.id ? 'Removing...' : 'Remove'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="calls-line-empty-state">
                          <CalendarClock aria-hidden="true" />
                          <div>
                            <strong>Call schedule not published yet.</strong>
                            <p>
                              {scheduleIsEmpty
                                ? data?.canManage
                                  ? 'Leadership listed the required cadence below. Add each call once the Meet link and exact time are confirmed.'
                                  : 'Management is still confirming the recurring call times and Meet links.'
                                : `No recurring calls are scheduled for ${CallDayLabels[selectedDay]}.`}
                            </p>
                          </div>
                          {scheduleIsEmpty && data?.canManage && (
                            <div className="calls-line-required-calls">
                              {REQUIRED_CALLS.map((call) => (
                                <button key={call.title} onClick={() => applyRequiredCall(call)} type="button">
                                  <strong>{call.title}</strong>
                                  <span>{CallDayLabels[call.day]} · {CallAudienceLabels[call.audience]}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <footer className="calls-line-footer">
                    <span>Times shown in CT · Google Meet links only.</span>
                    <span>Click any day to filter</span>
                  </footer>
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
        <DialogContent className="calls-line-modal" showCloseButton>
          <DialogHeader className="calls-line-modal-header">
            <p className="calls-line-eyebrow">Admin / recurring schedule</p>
            <DialogTitle>Add recurring call</DialogTitle>
            <DialogDescription>Create a weekly Meet block and keep the floor on the same signal.</DialogDescription>
          </DialogHeader>

          <div className="calls-line-starter-row">
            {CALL_STARTERS.map((starter) => (
              <button key={starter.label} className="calls-line-starter" type="button" onClick={() => applyStarter(starter)}>
                {starter.label}
              </button>
            ))}
          </div>

          <form
            className="calls-line-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <div className="calls-line-form-grid">
              <div className="calls-line-field calls-line-field-full">
                <Label htmlFor="call-title">Title</Label>
                <Input className="calls-line-field-control" id="call-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Team huddle" required />
              </div>
              <div className="calls-line-field">
                <Label htmlFor="call-day">Day</Label>
                <select className="calls-line-field-control" id="call-day" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value as CallDay })}>
                  {CALL_DAY_ORDER.map((day) => <option key={day} value={day}>{CallDayLabels[day]}</option>)}
                </select>
              </div>
              <div className="calls-line-field">
                <Label htmlFor="call-time">Time CT</Label>
                <Input className="calls-line-field-control" id="call-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
              </div>
              <div className="calls-line-field calls-line-field-full">
                <Label htmlFor="call-link">Google Meet link</Label>
                <Input className="calls-line-field-control" id="call-link" type="url" value={form.meetLink} onChange={(event) => setForm({ ...form, meetLink: event.target.value })} placeholder="https://meet.google.com/abc-defg-hij" required />
              </div>
              <div className="calls-line-field">
                <Label htmlFor="call-audience">Audience</Label>
                <select className="calls-line-field-control" id="call-audience" value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as CallAudience })}>
                  {(Object.keys(CallAudienceLabels) as CallAudience[]).map((audience) => <option key={audience} value={audience}>{CallAudienceLabels[audience]}</option>)}
                </select>
              </div>
              <div className="calls-line-field">
                <Label htmlFor="call-description">Description</Label>
                <Input className="calls-line-field-control" id="call-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="One-line purpose" />
              </div>
            </div>
            <div className="calls-line-form-actions">
              <button className="calls-line-secondary" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button className="calls-line-add-call" type="submit" disabled={saving || !form.title.trim() || !form.meetLink.trim()}>
                {saving ? 'Adding...' : 'Save recurring call'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
