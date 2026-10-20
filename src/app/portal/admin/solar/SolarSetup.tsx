'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { X } from 'lucide-react';
import { isAdminLevel } from '@/types';
import {
  SOLAR_SLOT_LENGTHS,
  SOLAR_TIMEZONES,
  type SolarHours,
  type SolarMode,
  type WeeklyWindow,
} from '@/lib/solar/availability';
import { DEFAULT_CONSULTANT_TZ, zoneAbbr } from '@/lib/solar/timezones';
import {
  MEET_LINK_ERROR,
  PHONE_ERROR,
  normalizeConsultantPhone,
  normalizeMeetLink,
} from '@/lib/solar/consultantContact';
import { displayPhone } from '@/lib/phone';
import { AdminFailed, AdminNotice, AdminSkeletonRows, StatusDot } from '@/components/portal/admin-d/AdminUi';
import { AdminSelect, ConfirmStrip, Seg, cx } from '@/components/portal/admin-ops/AdminKit';
import { UserPicker, pickerName, usePickerUsers, type PickerUser } from '@/components/admin/UserPicker';
import rep from '@/components/portal/rep/rep.module.css';
import ops from '@/components/portal/admin-ops/admin-ops.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import st from './solar-setup.module.css';
import { api, failure } from './setupApi';
import { GoogleCalendarRow } from './GoogleCalendarRow';
import { connectErrorText, googleStatusOf, type GoogleCalendarStatus } from '@/lib/solar/google/status';

// Admin > Solar > Setup: who takes consultations and when (solarAvailability,
// one panel each), and who hears about new leads (settings/solar). Both are
// read by lib/solar/server.ts.

// ---------- time helpers ----------

/** Monday first, the way a work week reads. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MODE_LABEL: Record<SolarMode, string> = { virtual: 'virtual', in_person: 'in-person' };
const SLOT_LABEL: Record<number, string> = { 30: '30 min', 60: '1 hour', 90: '90 min' };
const SLOT_PHRASE: Record<number, string> = { 30: 'a 30-minute', 60: 'a 1-hour', 90: 'a 90-minute' };
const DEFAULT_WINDOW = { start: '09:00', end: '17:00' };

const minutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "9:00 AM". */
function clock(value: string): string {
  const min = minutes(value);
  if (min === 24 * 60) return 'Midnight';
  const h = Math.floor(min / 60);
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Half-hour steps, 5 AM to 11 PM. */
const TIMES = Array.from({ length: 37 }, (_, i) => hm(5 * 60 + i * 30));

/** Slots that fit, counted the way openSlots lists them. */
function slotsIn(w: Pick<WeeklyWindow, 'start' | 'end'>, slotMin: number): number {
  const span = minutes(w.end) - minutes(w.start);
  return span >= slotMin ? Math.floor(span / slotMin) : 0;
}

const tzLabel = (tz: string) => SOLAR_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;

const sameHours = (a: SolarHours | null, b: SolarHours) =>
  JSON.stringify(a && hoursPart(a)) === JSON.stringify(hoursPart(b));
const hoursPart = (h: SolarHours): SolarHours => ({ tz: h.tz, slotMin: h.slotMin, modes: h.modes });

// ---------- consultants ----------

interface ConsultantDoc {
  consultantUid: string;
  name: string;
  tz: string;
  slotMin: number;
  modes: Partial<Record<SolarMode, WeeklyWindow[]>>;
  meetLink?: string;
  phone?: string;
  googleCalendar?: unknown;
}

/**
 * A consultant's hours plus what the homeowner's confirmation email shows.
 * Saved: meetLink and phone as stored ("+15125550142"). Draft: as typed.
 */
type ConsultantSettings = SolarHours & { meetLink: string; phone: string };

interface Consultant {
  uid: string;
  name: string;
  /** What the server has; null for one added here and not saved yet. */
  saved: ConsultantSettings | null;
  /** Their Google Calendar connection (absent: never connected). */
  google?: GoogleCalendarStatus;
}

function hoursOf(c: Pick<ConsultantDoc, 'tz' | 'slotMin' | 'modes' | 'meetLink' | 'phone'>): ConsultantSettings {
  return {
    tz: c.tz,
    slotMin: c.slotMin,
    modes: { virtual: c.modes.virtual ?? [], in_person: c.modes.in_person ?? [] },
    meetLink: c.meetLink ?? '',
    phone: c.phone ?? '',
  };
}

/** A saved consultant as the editor shows it: the phone reads "(512) 555-0142". */
const draftOf = (saved: ConsultantSettings): ConsultantSettings => ({
  ...saved,
  phone: saved.phone ? displayPhone(saved.phone) : '',
});

/** True when a typed field still means what is saved (an invalid entry never does). */
function sameContact(saved: ConsultantSettings | null, draft: ConsultantSettings): boolean {
  const meet = normalizeMeetLink(draft.meetLink);
  const phone = normalizeConsultantPhone(draft.phone);
  return meet.ok && phone.ok && meet.value === (saved?.meetLink ?? '') && phone.value === (saved?.phone ?? '');
}

type ContactField = 'meetLink' | 'phone';

function ContactInput({
  id,
  field,
  label,
  value,
  error,
  hint,
  onChange,
  onBlur,
}: {
  id: string;
  field: ContactField;
  label: string;
  value: string;
  error: string;
  hint: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const inputId = `${id}-${field}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const meet = field === 'meetLink';
  return (
    <div className={u.field}>
      <label className={u.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={ops.input}
        type={meet ? 'url' : 'tel'}
        inputMode={meet ? 'url' : 'tel'}
        autoComplete={meet ? 'off' : 'tel'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={meet ? 'meet.google.com/abc-defg-hij' : '(555) 555-5555'}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error ? (
        <p className={cx(u.hint, u.hintError)} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <p className={u.hint} id={hintId}>
        {hint}
      </p>
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  // A saved time off the half-hour grid stays pickable rather than silently changing.
  const list = options.includes(value) ? options : [...options, value].sort((a, b) => minutes(a) - minutes(b));
  return (
    <select className={cx(u.input, st.time)} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {list.map((t) => (
        <option key={t} value={t}>
          {clock(t)}
        </option>
      ))}
    </select>
  );
}

function DayRow({
  day,
  window,
  slotMin,
  onChange,
}: {
  day: number;
  window: WeeklyWindow | undefined;
  slotMin: number;
  onChange: (next: WeeklyWindow | null) => void;
}) {
  const short = window ? slotsIn(window, slotMin) === 0 : false;
  return (
    <li className={cx(st.day, !window && st.dayClosed)}>
      <span className={st.dayName}>{DAY_SHORT[day]}</span>
      {window ? (
        <span className={st.times}>
          <TimeSelect
            value={window.start}
            label={`${DAY_LONG[day]} start`}
            options={TIMES.slice(0, -1)}
            onChange={(start) => onChange({ ...window, start })}
          />
          <span className={st.to} aria-hidden="true">
            to
          </span>
          <TimeSelect
            value={window.end}
            label={`${DAY_LONG[day]} end`}
            options={TIMES.slice(1)}
            onChange={(end) => onChange({ ...window, end })}
          />
        </span>
      ) : (
        <span className={st.closed}>Closed</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(window)}
        aria-label={`${DAY_LONG[day]} open`}
        className={ops.switch}
        onClick={() => onChange(window ? null : { day, ...DEFAULT_WINDOW })}
      />
      {short ? (
        <span className={st.dayError} role="alert">
          Too short for {SLOT_PHRASE[slotMin] ?? `a ${slotMin}-minute`} slot
        </span>
      ) : null}
    </li>
  );
}

function Preview({ name, hours, mode, focusDay }: { name: string; hours: SolarHours; mode: SolarMode; focusDay: number | null }) {
  const windows = hours.modes[mode];
  const total = windows.reduce((sum, w) => sum + slotsIn(w, hours.slotMin), 0);
  const ordered = WEEK.map((d) => windows.find((w) => w.day === d)).filter(
    (w): w is WeeklyWindow => Boolean(w) && slotsIn(w!, hours.slotMin) > 0
  );
  if (total === 0 || ordered.length === 0) {
    return (
      <div className={cx(st.preview, st.previewEmpty)} aria-live="polite">
        <p className={st.previewLine}>
          <span className={st.previewCount}>0</span>
          <span className={st.previewWords}>
            <strong>{MODE_LABEL[mode]} slots a week</strong>
            <span className={st.previewSub}>
              Homeowners see no {MODE_LABEL[mode]} times with {name}.
            </span>
          </span>
        </p>
      </div>
    );
  }
  const w = ordered.find((x) => x.day === focusDay) ?? ordered[0];
  const count = slotsIn(w, hours.slotMin);
  const lastStart = hm(minutes(w.start) + (count - 1) * hours.slotMin);
  // In the consultant's own zone; the deck converts to each customer's zone.
  const zone = zoneAbbr(hours.tz);
  // Non-breaking, so a time never wraps away from its AM/PM and zone.
  const first = `${clock(w.start)} ${zone}`.replace(/ /g, ' ');
  const last = `${clock(lastStart)} ${zone}`.replace(/ /g, ' ');
  return (
    <div className={st.preview} aria-live="polite">
      <p className={st.previewLine}>
        <span className={st.previewCount}>{total}</span>
        <span className={st.previewWords}>
          <strong>
            {MODE_LABEL[mode]} {total === 1 ? 'slot' : 'slots'} a week
          </strong>
          <span className={st.previewSub}>Homeowners see them in their own time zone.</span>
        </span>
      </p>
      <p className={st.previewDay}>
        {DAY_LONG[w.day]}: {count === 1 ? `one slot, at ${first}` : `${count} slots, the first at ${first} and the last at ${last}`}.
      </p>
    </div>
  );
}

/** Where a day's open hours fall on a 5 AM to 11 PM track, as shares of it. */
const TRACK_FROM = 5 * 60;
const TRACK_SPAN = 18 * 60;
function trackOf(w: WeeklyWindow): { top: number; size: number } {
  const from = Math.min(Math.max(minutes(w.start) - TRACK_FROM, 0), TRACK_SPAN);
  const to = Math.min(Math.max(minutes(w.end) - TRACK_FROM, from), TRACK_SPAN);
  return { top: from / TRACK_SPAN, size: (to - from) / TRACK_SPAN };
}

/**
 * The week drawn from its own hours: a column per day, the open window filled
 * where it falls between 5 AM and 11 PM. It redraws as the hours change. The
 * sentence beside it says the same, so it is hidden from screen readers.
 */
function WeekStrip({ hours, mode, focusDay }: { hours: SolarHours; mode: SolarMode; focusDay: number | null }) {
  const windows = hours.modes[mode];
  return (
    <div className={st.strip} aria-hidden="true">
      {WEEK.map((day) => {
        const w = windows.find((x) => x.day === day);
        const t = w ? trackOf(w) : null;
        return (
          <span key={day} className={cx(st.stripDay, !w && st.stripClosed, w && day === focusDay && st.stripFocus)}>
            <span className={st.stripTrack}>
              {t ? (
                <span
                  className={cx(st.stripFill, slotsIn(w!, hours.slotMin) === 0 && st.stripShort)}
                  style={{ transform: `translateY(${(t.top * 100).toFixed(2)}%) scaleY(${t.size.toFixed(4)})` }}
                />
              ) : null}
            </span>
            <span className={st.stripName}>{DAY_SHORT[day]}</span>
          </span>
        );
      })}
    </div>
  );
}

function ConsultantPanel({
  consultant,
  seeded,
  removable,
  own,
  onSaved,
  onRemoved,
  onGoogle,
}: {
  consultant: Consultant;
  seeded: boolean;
  removable: boolean;
  /** The signed-in person's own card. */
  own: boolean;
  onSaved: (uid: string, settings: ConsultantSettings) => void;
  onRemoved: (uid: string, futureBookings: number | null) => void;
  onGoogle: (uid: string, status: GoogleCalendarStatus | undefined) => void;
}) {
  const { uid, name, saved, google } = consultant;
  const [draft, setDraft] = useState<ConsultantSettings>(() =>
    saved
      ? draftOf(saved)
      : { tz: DEFAULT_CONSULTANT_TZ, slotMin: 60, modes: { virtual: [], in_person: [] }, meetLink: '', phone: '' }
  );
  // A field's error shows once it has been left (or Save was pressed), not mid-typing.
  const [touched, setTouched] = useState<Record<ContactField, boolean>>({ meetLink: false, phone: false });
  const [serverField, setServerField] = useState<{ field: ContactField; error: string } | null>(null);
  const [mode, setMode] = useState<SolarMode>(() =>
    saved && saved.modes.virtual.length === 0 && saved.modes.in_person.length > 0 ? 'in_person' : 'virtual'
  );
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const dirty = !sameHours(saved, draft) || !sameContact(saved, draft);
  const checked = { meetLink: normalizeMeetLink(draft.meetLink), phone: normalizeConsultantPhone(draft.phone) };
  const fieldError = (field: ContactField): string => {
    if (serverField?.field === field) return serverField.error;
    const c = checked[field];
    return !c.ok && touched[field] ? c.error : '';
  };
  const invalid = (['virtual', 'in_person'] as const).some((m) =>
    draft.modes[m].some((w) => slotsIn(w, draft.slotMin) === 0)
  );
  const headId = `consultant-${uid}`;

  const edit = (next: ConsultantSettings) => {
    setDraft(next);
    setJustSaved(false);
    setError('');
  };

  const editContact = (field: ContactField, value: string) => {
    if (serverField?.field === field) setServerField(null);
    edit({ ...draft, [field]: value });
  };

  // Leaving a valid field tidies it: the Meet link to its full form, a US phone to (512) 555-0142.
  const tidy = (field: ContactField) => {
    setTouched((t) => ({ ...t, [field]: true }));
    const c = checked[field];
    if (!c.ok || !c.value) return;
    const shown = field === 'phone' ? displayPhone(c.value) : c.value;
    if (shown !== draft[field]) setDraft((d) => ({ ...d, [field]: shown }));
  };

  const setDay = (day: number, next: WeeklyWindow | null) => {
    const current = draft.modes[mode];
    const rest = current.filter((w) => w.day !== day);
    let window = next;
    // A day switched on borrows the hours of the nearest open day.
    if (next && !current.some((w) => w.day === day) && rest.length > 0) {
      const near = [...rest].sort((a, b) => Math.abs(a.day - day) - Math.abs(b.day - day))[0];
      window = { day, start: near.start, end: near.end };
    }
    setFocusDay(window ? day : null);
    edit({ ...draft, modes: { ...draft.modes, [mode]: window ? [...rest, window].sort((a, b) => a.day - b.day) : rest } });
  };

  const save = async () => {
    if (!checked.meetLink.ok || !checked.phone.ok) {
      setTouched({ meetLink: true, phone: true });
      document.getElementById(`${headId}-${checked.meetLink.ok ? 'phone' : 'meetLink'}`)?.focus();
      return;
    }
    setSaving(true);
    setError('');
    setServerField(null);
    setJustSaved(false);
    try {
      const data = await api(`/api/portal/solar/consultants/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...hoursPart(draft), meetLink: draft.meetLink.trim(), phone: draft.phone.trim() }),
      });
      const next = hoursOf(data.consultant as ConsultantDoc);
      setDraft(draftOf(next));
      onSaved(uid, next);
      setJustSaved(true);
    } catch (err) {
      const message = failure(err, "Couldn't save. Try again.");
      // The API names the field it refused; show the message under it.
      const field: ContactField | null =
        message === MEET_LINK_ERROR ? 'meetLink' : message === PHONE_ERROR ? 'phone' : null;
      if (field) setServerField({ field, error: message });
      else setError(message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!saved) {
      onRemoved(uid, null);
      return;
    }
    setRemoving(true);
    setError('');
    try {
      const data = await api(`/api/portal/solar/consultants/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      onRemoved(uid, typeof data.futureBookings === 'number' ? data.futureBookings : 0);
    } catch (err) {
      setError(failure(err, "Couldn't remove. Try again."));
      setConfirming(false);
      setRemoving(false);
    }
  };

  const status = !saved ? (
    <StatusDot tone="amber">Not saved</StatusDot>
  ) : dirty ? (
    <StatusDot tone="amber">Unsaved changes</StatusDot>
  ) : seeded ? (
    <StatusDot tone="muted">Built-in hours</StatusDot>
  ) : (
    <StatusDot tone="lime">Live</StatusDot>
  );

  const tzOptions: { value: string; label: string }[] = SOLAR_TIMEZONES.some((z) => z.value === draft.tz)
    ? [...SOLAR_TIMEZONES]
    : [...SOLAR_TIMEZONES, { value: draft.tz, label: draft.tz }];

  const slotText = SLOT_LABEL[draft.slotMin] ?? `${draft.slotMin} min`;

  return (
    <section className={cx(rep.panel, st.consultant)} aria-labelledby={`${headId}-name`} id={headId}>
      {/* The field: whose week this is, and the week itself as homeowners get it. */}
      <header className={st.field}>
        <div className={st.who}>
          <h2 className={st.name} id={`${headId}-name`}>
            {name}
          </h2>
          <p className={st.whoMeta}>
            {own ? <span className={st.you}>Your card</span> : null}
            <span>
              {tzLabel(draft.tz)} time, {slotText} slots
            </span>
            <span className={st.whoStatus}>{status}</span>
          </p>
        </div>
        <div className={st.glance}>
          <Preview name={name} hours={draft} mode={mode} focusDay={focusDay} />
          <WeekStrip hours={draft} mode={mode} focusDay={focusDay} />
        </div>
        <div className={st.well}>
          <Seg
            label="Consultation type"
            value={mode}
            options={[
              { value: 'virtual', label: 'Virtual', count: draft.modes.virtual.length },
              { value: 'in_person', label: 'In person', count: draft.modes.in_person.length },
            ]}
            onChange={(m) => {
              setMode(m);
              setFocusDay(null);
            }}
          />
        </div>
      </header>
      <div className={cx(u.panelBody, st.body)}>
        <div className={st.group} role="group" aria-labelledby={`${headId}-hours`}>
          <h3 className={st.groupTitle} id={`${headId}-hours`}>
            {mode === 'virtual' ? 'Virtual' : 'In-person'} hours
          </h3>
          <ul
            className={st.days}
            aria-label={`${mode === 'virtual' ? 'Virtual' : 'In-person'} hours, ${tzLabel(draft.tz)} Time`}
          >
            {WEEK.map((day) => (
              <DayRow
                key={day}
                day={day}
                slotMin={draft.slotMin}
                window={draft.modes[mode].find((w) => w.day === day)}
                onChange={(next) => setDay(day, next)}
              />
            ))}
          </ul>
        </div>

        <div className={st.group} role="group" aria-labelledby={`${headId}-rules`}>
          <h3 className={st.groupTitle} id={`${headId}-rules`}>
            Booking rules
          </h3>
          <div className={st.settings}>
            <div className={u.field}>
              <span className={u.label}>Time zone</span>
              <AdminSelect value={draft.tz} label="Time zone" onChange={(tz) => edit({ ...draft, tz })}>
                {tzOptions.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className={u.field}>
              <span className={u.label}>Slot length</span>
              <div className={st.well}>
                <Seg
                  label="Slot length"
                  value={String(draft.slotMin)}
                  options={SOLAR_SLOT_LENGTHS.map((m) => ({ value: String(m), label: SLOT_LABEL[m] }))}
                  onChange={(v) => edit({ ...draft, slotMin: Number(v) })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={st.group} role="group" aria-labelledby={`${headId}-reach`}>
          <h3 className={st.groupTitle} id={`${headId}-reach`}>
            Calendar and contact
          </h3>
          <GoogleCalendarRow
            uid={uid}
            name={name}
            own={own}
            canConnect={Boolean(saved) && !seeded}
            status={google}
            onChange={onGoogle}
          />
          <div className={st.contact}>
            <ContactInput
              id={headId}
              field="meetLink"
              label="Google Meet link"
              value={draft.meetLink}
              error={fieldError('meetLink')}
              hint={
                google?.connected
                  ? 'Each booking gets its own Meet link from Google Calendar. This one is the backup.'
                  : 'Google Meet → New meeting → Create a meeting for later.'
              }
              onChange={(v) => editContact('meetLink', v)}
              onBlur={() => tidy('meetLink')}
            />
            <ContactInput
              id={headId}
              field="phone"
              label="Phone"
              value={draft.phone}
              error={fieldError('phone')}
              hint="Homeowners can call or text this number."
              onChange={(v) => editContact('phone', v)}
              onBlur={() => tidy('phone')}
            />
          </div>
        </div>

        {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
        {justSaved && !dirty ? <AdminNotice tone="ok">Saved. Homeowners see these hours now.</AdminNotice> : null}

        {confirming ? (
          <ConfirmStrip
            label={`Remove ${name}?`}
            sub="Homeowners stop seeing their times. Consultations already booked stay booked."
            confirmLabel="Remove"
            confirming={removing}
            onCancel={() => setConfirming(false)}
            onConfirm={remove}
          />
        ) : (
          <div className={cx(u.btnRow, st.actions)}>
            <button
              type="button"
              className={cx(rep.btnPrimary, u.primarySm)}
              disabled={saving || invalid || (Boolean(saved) && !dirty && !seeded)}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {removable ? (
              <button
                type="button"
                className={cx(ops.btnGhost, u.sm)}
                disabled={saving}
                onClick={() => (saved ? setConfirming(true) : remove())}
              >
                {saved ? 'Remove' : 'Discard'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Back from Google's sign-in (web): the callback sent the browser here with
 * ?google=connected|error[&reason][&freebusy=off]. Shown once as a banner, then
 * dropped from the address so a reload doesn't repeat it.
 */
type GoogleNotice = { tone: 'ok' | 'warn' | 'error'; text: string };

function googleReturnNotice(search: string): GoogleNotice | null {
  const params = new URLSearchParams(search);
  const outcome = params.get('google');
  if (outcome === 'connected') {
    return params.get('freebusy') === 'off'
      ? {
          tone: 'warn',
          text: "Google Calendar connected, but free/busy wasn't allowed, so homeowners still see every open time. Reconnect and allow it to hide busy times.",
        }
      : { tone: 'ok', text: 'Google Calendar connected. New bookings go on your calendar, and busy times are hidden from homeowners.' };
  }
  if (outcome === 'error') {
    return { tone: 'error', text: `Google Calendar isn't connected. ${connectErrorText(params.get('reason'))}` };
  }
  return null;
}

function useGoogleReturn() {
  // Read once, from the address the page opened with (Setup renders on the client, after sign-in).
  const [notice, setNotice] = useState<GoogleNotice | null>(() =>
    typeof window === 'undefined' ? null : googleReturnNotice(window.location.search)
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('google')) return;
    for (const key of ['google', 'reason', 'freebusy']) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return { notice, dismiss: () => setNotice(null) };
}

function Consultants({ users, usersLoaded, after }: { users: PickerUser[]; usersLoaded: boolean; after: ReactNode }) {
  const [list, setList] = useState<Consultant[] | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [removedNote, setRemovedNote] = useState('');
  const added = useRef<string | null>(null);
  const { user } = useAuth();
  const googleReturn = useGoogleReturn();

  const onGoogle = useCallback((uid: string, google: GoogleCalendarStatus | undefined) => {
    setList((prev) => prev?.map((c) => (c.uid === uid ? { ...c, google } : c)) ?? prev);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api('/api/portal/solar/consultants');
        if (!active) return;
        const docs = (data.consultants ?? []) as ConsultantDoc[];
        setList(
          docs.map((c) => ({ uid: c.consultantUid, name: c.name, saved: hoursOf(c), google: googleStatusOf(c.googleCalendar) }))
        );
        setSeeded(data.seeded === true);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  // A consultant just added scrolls into view, so their hours are right there.
  useEffect(() => {
    if (!added.current) return;
    document.getElementById(`consultant-${added.current}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    added.current = null;
  }, [list]);

  const candidates = useMemo(
    () => users.filter((p) => p.status === 'active' && !list?.some((c) => c.uid === p.uid)),
    [users, list]
  );

  if (failed) {
    return (
      <>
        <section className={rep.panel} aria-label="Consultants">
          <AdminFailed
            what="consultants"
            onRetry={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          />
        </section>
        {after}
      </>
    );
  }
  if (!list) {
    return (
      <>
        <section className={rep.panel} aria-label="Consultants">
          <AdminSkeletonRows rows={4} label="Loading consultants" />
        </section>
        {after}
      </>
    );
  }

  const savedCount = list.filter((c) => c.saved).length;

  const onSaved = (uid: string, hours: ConsultantSettings) => {
    // The first save writes the whole seed, so everyone shown is saved now.
    setSeeded(false);
    setList((prev) => prev?.map((c) => (c.uid === uid ? { ...c, saved: hours } : c)) ?? prev);
  };

  const onRemoved = (uid: string, futureBookings: number | null) => {
    const gone = list.find((c) => c.uid === uid);
    if (gone && futureBookings !== null) {
      setSeeded(false);
      setRemovedNote(
        futureBookings > 0
          ? `${gone.name} is removed. ${futureBookings} upcoming ${
              futureBookings === 1 ? 'consultation is' : 'consultations are'
            } still booked with them; cancel or move ${futureBookings === 1 ? 'it' : 'them'} from Leads.`
          : `${gone.name} is removed.`
      );
    }
    setList((prev) => prev?.filter((c) => c.uid !== uid) ?? prev);
  };

  return (
    <>
      {seeded ? (
        <AdminNotice tone="warn">
          These are the built-in hours. Homeowners book against them until you save, and saving any consultant saves
          everyone shown here.
        </AdminNotice>
      ) : null}
      {removedNote ? (
        <AdminNotice tone="ok" onDismiss={() => setRemovedNote('')}>
          {removedNote}
        </AdminNotice>
      ) : null}
      {googleReturn.notice ? (
        <AdminNotice tone={googleReturn.notice.tone} onDismiss={googleReturn.dismiss}>
          {googleReturn.notice.text}
        </AdminNotice>
      ) : null}
      <div className={st.grid}>
        {list.map((c) => (
          <ConsultantPanel
            key={c.uid}
            consultant={c}
            seeded={seeded}
            removable={!c.saved || savedCount > 1}
            own={Boolean(user?.uid) && user?.uid === c.uid}
            onSaved={onSaved}
            onRemoved={onRemoved}
            onGoogle={onGoogle}
          />
        ))}
        <section className={cx(rep.panel, st.add)} aria-labelledby="solar-add">
          <header className={st.field}>
            <h2 className={st.name} id="solar-add">
              Add a consultant
            </h2>
            <p className={st.fieldNote}>Their days start closed. Open the ones they take, then save.</p>
          </header>
          <div className={cx(u.panelBody, u.field)}>
            <label className={u.label} htmlFor="solar-add-search">
              Search people
            </label>
            <UserPicker
              id="solar-add-search"
              candidates={candidates}
              placeholder={usersLoaded ? 'Name or email' : 'Loading people…'}
              listLabel="People"
              onPick={(p) => {
                added.current = p.uid;
                setRemovedNote('');
                setList((prev) => [...(prev ?? []), { uid: p.uid, name: pickerName(p), saved: null }]);
              }}
            />
          </div>
        </section>
        {after}
      </div>
    </>
  );
}

// ---------- alerts ----------

interface Recipient {
  uid: string;
  name: string;
  missing?: boolean;
}

interface AlertSettings {
  notifyOwner: boolean;
  recipients: Recipient[];
}

function AlertsPanel({ users }: { users: PickerUser[] }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api('/api/portal/settings/solar');
        if (active) setSettings({ notifyOwner: data.notifyOwner === true, recipients: data.recipients ?? [] });
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const candidates = useMemo(
    () =>
      users.filter(
        (p) => p.status === 'active' && isAdminLevel(p.role) && !settings?.recipients.some((r) => r.uid === p.uid)
      ),
    [users, settings]
  );

  // Optimistic, like the form alerts: show the change, save it, undo it if the save fails.
  const commit = async (next: AlertSettings) => {
    if (!settings) return;
    const before = settings;
    setSettings(next);
    setSaving(true);
    setSaveError('');
    try {
      const data = await api('/api/portal/settings/solar', {
        method: 'PUT',
        body: JSON.stringify({ notifyOwner: next.notifyOwner, leadAlertUids: next.recipients.map((r) => r.uid) }),
      });
      setSettings({ notifyOwner: data.notifyOwner === true, recipients: data.recipients ?? next.recipients });
    } catch (err) {
      setSettings(before);
      setSaveError(failure(err, "Couldn't save that change. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const on = settings?.notifyOwner === true;

  return (
    <section className={cx(rep.panel, st.alerts)} aria-labelledby="solar-alerts">
      <header className={st.field}>
        <h2 className={st.name} id="solar-alerts">
          Lead alerts
        </h2>
        <p className={st.fieldNote}>Who gets each solar lead once it’s booked, or once the rep finishes with the homeowner.</p>
      </header>
      {failed ? (
        <AdminFailed
          what="lead alerts"
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : !settings ? (
        <AdminSkeletonRows rows={2} label="Loading lead alerts" />
      ) : (
        <div className={cx(u.panelBody, st.stack)}>
          <div className={st.ownerRow}>
            <div className={st.ownerText}>
              <span className={st.ownerLabel} id="solar-notify-owner">
                Notify owner
              </span>
              <p className={st.help} id="solar-notify-owner-help">
                {on
                  ? 'On: lead alerts go to the people below, and the owner gets the booking notices for their own calendar.'
                  : 'Off: the owner gets no solar notifications, and lead alerts go to Jacob only. Bookings on the owner’s calendar are sent to Jacob as well.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="solar-notify-owner"
              aria-describedby="solar-notify-owner-help"
              className={ops.switch}
              disabled={saving}
              onClick={() => commit({ ...settings, notifyOwner: !on })}
            />
          </div>

          <div className={cx(u.field, st.recipients)}>
            <label className={u.label} htmlFor="solar-alert-search">
              Lead alerts go to
            </label>
            <p className={st.help}>
              {!on
                ? 'Used once Notify owner is on. Until then, only Jacob gets lead alerts.'
                : settings.recipients.length > 0
                  ? 'Only the people listed get lead alerts.'
                  : 'Nobody is listed, so lead alerts go to Jacob.'}
            </p>
            {settings.recipients.length > 0 ? (
              <ul className={cx(st.chips, !on && st.unused)} aria-label="Lead alert recipients">
                {settings.recipients.map((r) => (
                  <li key={r.uid} className={cx(st.chip, r.missing && st.chipMissing)}>
                    <span>{r.name}</span>
                    <button
                      type="button"
                      className={st.chipRemove}
                      aria-label={`Remove ${r.name}`}
                      disabled={saving}
                      onClick={() => commit({ ...settings, recipients: settings.recipients.filter((x) => x.uid !== r.uid) })}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <UserPicker
              id="solar-alert-search"
              candidates={saving ? [] : candidates}
              placeholder="Add an admin"
              listLabel="Admins"
              onPick={(p) => commit({ ...settings, recipients: [...settings.recipients, { uid: p.uid, name: pickerName(p) }] })}
            />
          </div>

          {saveError ? <AdminNotice tone="error">{saveError}</AdminNotice> : null}
        </div>
      )}
    </section>
  );
}

export default function SolarSetup() {
  const { users, loaded } = usePickerUsers(true);
  return (
    <div className={st.setup}>
      {/* Alerts sit in the consultants' grid: beside "Add a consultant" on a wide screen. */}
      <Consultants users={users} usersLoaded={loaded} after={<AlertsPanel users={users} />} />
    </div>
  );
}
