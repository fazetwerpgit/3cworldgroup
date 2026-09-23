'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, Check, ChevronDown, Plus, RotateCw, ShieldCheck, Users, Video, X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import c from '@/components/portal/rep/rep-calls.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
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
    title: 'Leadership Call',
    description: 'Leadership operating guidance and business updates.',
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
    label: 'Leadership',
    title: 'Leadership Call',
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

// The calls route verifies the caller from the ID token — audience scoping and
// the createdBy stamp both come from it, never from client input.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

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

/** "3h 12m", "45m", or "1d 13h" once the call is a day or more away. */
function formatCountdown(minutes: number): string {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function getCentralDateNumber(day: CallDay, date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const centralDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const offset = CALL_DAY_ORDER.indexOf(day) - CALL_DAY_ORDER.indexOf(getCentralNow(date).day);
  centralDate.setUTCDate(centralDate.getUTCDate() + offset);
  return String(centralDate.getUTCDate());
}

export default function CallsSchedulePage() {
  const { user } = useAuth();
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
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
      const response = await fetch('/api/portal/calls', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load call schedule');
      setData(json);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load call schedule');
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
        headers: await authHeaders(true),
        body: JSON.stringify(form),
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
        headers: await authHeaders(true),
        body: JSON.stringify({ callId: call.id }),
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

  const retryLoad = () => {
    setLoading(true);
    void fetchCalls();
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const dayHasCalls = (day: CallDay) => orderedCalls.some((call) => call.day === day);
  const formReady = Boolean(form.title.trim() && form.meetLink.trim());

  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>
          Calls
          {data && <span className={p.titleMeta}>{todayCalls.length} today</span>}
        </h1>
      </header>

      {error && (
        <div className={`${p.notice} ${p.noticeRed}`} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <CallsSkeleton />
      ) : !data ? (
        <section className={s.panel}>
          <div className={s.failed} role="alert">
            <span>Couldn&apos;t load the call schedule</span>
            <button type="button" className={s.retry} onClick={retryLoad}>
              <RotateCw size={14} aria-hidden="true" /> Retry
            </button>
            {loadError ? <span className={s.srOnly}>{loadError}</span> : null}
          </div>
        </section>
      ) : (
        <div className={c.layout}>
          <div className={c.colA}>
            {nextCall && nextCallMinutes !== null ? (
              <section className={`${s.panel} ${c.next}`} aria-labelledby="next-call-title">
                <div className={c.nextBody}>
                  <div>
                    <p className={s.kicker}>Next call</p>
                    <h2 id="next-call-title" className={c.nextTitle}>{nextCall.title}</h2>
                    <p className={c.nextMeta}>
                      {nextCall.day === now.day ? 'Today' : CallDayLabels[nextCall.day]} · {formatTime(nextCall.time)} CT ·{' '}
                      {CallAudienceLabels[nextCall.audience]}
                    </p>
                  </div>
                  <p className={c.count}>
                    <span className={c.countLabel}>Starts in</span>
                    <strong className={c.countNum}>{formatCountdown(nextCallMinutes)}</strong>
                  </p>
                </div>
                <a
                  className={`${s.btnPrimary} ${c.nextJoin}`}
                  href={nextCall.meetLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Video size={20} aria-hidden="true" />
                  Join Meet
                </a>
              </section>
            ) : null}

            {data.canManage && (
              <section className={`${s.panel} ${c.manage}`} aria-label="Call settings">
                <p>
                  <strong>Call settings</strong>
                  Manage recurring calls and times.
                </p>
                <button className={`${s.btnSecondary} ${c.addBtn}`} onClick={() => setShowForm(true)} type="button">
                  <Plus size={18} aria-hidden="true" />
                  Add call
                </button>
              </section>
            )}
          </div>

          <div className={c.colB}>
            {scheduleIsEmpty ? (
              <section className={s.panel}>
                <div className={p.empty} role="status">
                  <span className={`${p.tile} ${p.tileMuted}`}>
                    <CalendarClock size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>No calls on the schedule yet</strong>
                    <p>Team calls show up here with a join link once they&apos;re set.</p>
                  </div>
                </div>
                {data.canManage && (
                  <div className={c.presets}>
                    {REQUIRED_CALLS.map((call) => (
                      <button key={call.title} className={c.preset} onClick={() => applyRequiredCall(call)} type="button">
                        {call.title}
                        <span>
                          {CallDayLabels[call.day]} · {CallAudienceLabels[call.audience]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className={s.panel} aria-labelledby="week-title">
                <div className={s.panelHead}>
                  <h2 id="week-title" className={s.kicker}>This week</h2>
                  <span className={p.rowSub}>Central Time</span>
                </div>
                <div className={c.week} role="tablist" aria-label="Select day">
                  {CALL_DAY_ORDER.map((day) => {
                    const date = getCentralDateNumber(day, new Date(nowTick));
                    return (
                      <button
                        key={day}
                        className={`${c.day} ${day === now.day ? c.dayToday : ''}`}
                        type="button"
                        role="tab"
                        aria-label={`${CallDayLabels[day]} ${date}`}
                        aria-selected={selectedDay === day}
                        onClick={() => setSelectedDay(day)}
                      >
                        <span className={c.dayDow}>{CallDayLabels[day].slice(0, 3)}</span>
                        <span className={c.dayDate}>{date}</span>
                        <span className={`${c.dayMark} ${dayHasCalls(day) ? '' : c.dayMarkNone}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>

                <div className={c.dayHead}>
                  <h3 className={c.dayName}>
                    {CallDayLabels[selectedDay]}
                    {selectedDay === now.day && <span> · today</span>}
                  </h3>
                  <p className={c.dayCount}>
                    {selectedCalls.length} call{selectedCalls.length === 1 ? '' : 's'}
                  </p>
                </div>

                {selectedCalls.length > 0 ? (
                  <ul className={p.rows}>
                    {selectedCalls.map((call) => {
                      const past = isPastOccurrence(call, now);
                      return (
                        <li key={call.id} className={`${c.call} ${past ? c.callPast : ''}`}>
                          <span className={c.callTime}>
                            {formatTime(call.time)}
                            <small>CT</small>
                          </span>
                          <div className={c.callBody}>
                            <h4 className={c.callTitle}>{call.title}</h4>
                            <span className={`${c.audience} ${call.audience === 'managers' ? c.audienceMgr : ''}`}>
                              {call.audience === 'managers' ? (
                                <ShieldCheck size={14} aria-hidden="true" />
                              ) : (
                                <Users size={14} aria-hidden="true" />
                              )}
                              {CallAudienceLabels[call.audience]}
                            </span>
                            <p className={c.callDesc}>{call.description || 'Recurring team call.'}</p>
                          </div>
                          <div className={c.callActions}>
                            {past ? (
                              <span className={c.done}>
                                <Check size={16} aria-hidden="true" />
                                Done for today
                              </span>
                            ) : (
                              <a className={`${s.btnSecondary} ${c.join}`} href={call.meetLink} target="_blank" rel="noreferrer">
                                <Video size={18} aria-hidden="true" />
                                Join
                              </a>
                            )}
                            {data.canManage && (
                              <button
                                className={c.remove}
                                type="button"
                                onClick={() => handleDelete(call)}
                                disabled={deletingId === call.id}
                              >
                                {deletingId === call.id ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={`${p.hint} ${c.dayHead}`}>No calls this day.</p>
                )}
              </section>
            )}

            {!scheduleIsEmpty && <p className={p.foot}>Times are Central. Join opens Google Meet.</p>}
          </div>
        </div>
      )}

      {showForm && (
        <AddCallSheet onClose={closeForm} title="Add a recurring call">
          <form
            className={c.sheetForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <p className={p.hint}>Set a weekly Meet call for the team.</p>
            <div className={c.starters} aria-label="Start from">
              {CALL_STARTERS.map((starter) => (
                <button key={starter.label} className={p.chip} type="button" onClick={() => applyStarter(starter)}>
                  {starter.label}
                </button>
              ))}
            </div>
            <div className={c.formGrid}>
              <label className={`${p.field} ${c.wide}`}>
                <span className={p.label}>Title</span>
                <input className={p.input} id="call-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Team huddle" required />
              </label>
              <label className={p.field}>
                <span className={p.label}>Day</span>
                <span className={c.selectWrap}>
                  <select className={p.input} id="call-day" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value as CallDay })}>
                    {CALL_DAY_ORDER.map((day) => <option key={day} value={day}>{CallDayLabels[day]}</option>)}
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </label>
              <label className={p.field}>
                <span className={p.label}>Time (Central)</span>
                <input className={p.input} id="call-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
              </label>
              <label className={`${p.field} ${c.wide}`}>
                <span className={p.label}>Google Meet link</span>
                <input className={p.input} id="call-link" type="url" value={form.meetLink} onChange={(event) => setForm({ ...form, meetLink: event.target.value })} placeholder="https://meet.google.com/abc-defg-hij" required />
              </label>
              <label className={p.field}>
                <span className={p.label}>Who joins</span>
                <span className={c.selectWrap}>
                  <select className={p.input} id="call-audience" value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as CallAudience })}>
                    {(Object.keys(CallAudienceLabels) as CallAudience[]).map((audience) => <option key={audience} value={audience}>{CallAudienceLabels[audience]}</option>)}
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </label>
              <label className={p.field}>
                <span className={p.label}>Description</span>
                <input className={p.input} id="call-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="One-line purpose" />
              </label>
            </div>
            <div className={c.sheetActions}>
              <button className={s.btnSecondary} type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button className={s.btnPrimary} type="submit" disabled={saving || !formReady}>
                {saving ? 'Adding…' : 'Save call'}
              </button>
            </div>
          </form>
        </AddCallSheet>
      )}
    </div>
  );
}

function CallsSkeleton() {
  return (
    <div className={c.layout} aria-busy="true" aria-label="Loading calls">
      <section className={s.panel}>
        <div className={c.nextBody}>
          <span className={`${s.skel} ${p.skelLineShort}`} />
          <span className={`${s.skel} ${p.skelLine}`} style={{ height: 22, width: '70%' }} />
          <span className={`${s.skel}`} style={{ height: 44, width: 140 }} />
        </div>
      </section>
      <section className={s.panel}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={p.skelRow}>
            <span className={`${s.skel} ${p.skelTile}`} />
            <span className={p.skelLines}>
              <span className={`${s.skel} ${p.skelLine}`} />
              <span className={`${s.skel} ${p.skelLineShort}`} />
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Manager-only add form: bottom sheet on phone, centred dialog on desktop, portaled to <body>. */
function AddCallSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="add-call-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="add-call-title" className={s.sheetTitle}>{title}</h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={s.sheetBody}>{children}</div>
        </section>
      </div>
    </BodyLayer>
  );
}
