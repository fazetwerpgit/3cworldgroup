'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
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

// Admin > Solar > Setup: who takes consultations and when (solarAvailability,
// one panel each), and who hears about new leads (settings/solar). Both are
// read by lib/solar/server.ts.

async function api(url: string, init?: RequestInit) {
  const token = await getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token ?? ''}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : '');
  return data;
}

const failure = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

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
        className={u.input}
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
      <div className={st.preview} aria-live="polite">
        <span className={st.previewLabel}>Homeowners see</span>
        <strong>
          No {MODE_LABEL[mode]} times with {name}
        </strong>
      </div>
    );
  }
  const w = ordered.find((x) => x.day === focusDay) ?? ordered[0];
  const count = slotsIn(w, hours.slotMin);
  const lastStart = hm(minutes(w.start) + (count - 1) * hours.slotMin);
  // In the consultant's own zone; the deck converts to each customer's zone.
  const zone = zoneAbbr(hours.tz);
  const first = `${clock(w.start)} ${zone}`;
  const last = `${clock(lastStart)} ${zone}`;
  return (
    <div className={st.preview} aria-live="polite">
      <span className={st.previewLabel}>Homeowners see</span>
      <strong>
        {total} {MODE_LABEL[mode]} {total === 1 ? 'slot' : 'slots'} a week
      </strong>
      <span className={st.previewDay}>
        {DAY_LONG[w.day]}: {count === 1 ? `one slot, at ${first}` : `${count} slots, the first at ${first} and the last at ${last}`}
        . Customers see these in their own time zone.
      </span>
    </div>
  );
}

function ConsultantPanel({
  consultant,
  seeded,
  removable,
  onSaved,
  onRemoved,
}: {
  consultant: Consultant;
  seeded: boolean;
  removable: boolean;
  onSaved: (uid: string, settings: ConsultantSettings) => void;
  onRemoved: (uid: string, futureBookings: number | null) => void;
}) {
  const { uid, name, saved } = consultant;
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

  return (
    <section className={cx(rep.panel, st.consultant)} aria-labelledby={`${headId}-name`} id={headId}>
      <div className={cx(rep.panelHead, u.band)}>
        <h2 id={`${headId}-name`}>{name}</h2>
        {status}
      </div>
      <div className={cx(u.panelBody, st.stack)}>
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

        <div className={st.contact}>
          <ContactInput
            id={headId}
            field="meetLink"
            label="Google Meet link"
            value={draft.meetLink}
            error={fieldError('meetLink')}
            hint="Google Meet → New meeting → Create a meeting for later, then paste the link."
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

        <div className={st.week}>
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

        <Preview name={name} hours={draft} mode={mode} focusDay={focusDay} />

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

function Consultants({ users, usersLoaded, after }: { users: PickerUser[]; usersLoaded: boolean; after: ReactNode }) {
  const [list, setList] = useState<Consultant[] | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [removedNote, setRemovedNote] = useState('');
  const added = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api('/api/portal/solar/consultants');
        if (!active) return;
        const docs = (data.consultants ?? []) as ConsultantDoc[];
        setList(docs.map((c) => ({ uid: c.consultantUid, name: c.name, saved: hoursOf(c) })));
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
      <div className={st.grid}>
        {list.map((c) => (
          <ConsultantPanel
            key={c.uid}
            consultant={c}
            seeded={seeded}
            removable={!c.saved || savedCount > 1}
            onSaved={onSaved}
            onRemoved={onRemoved}
          />
        ))}
        <section className={cx(rep.panel, st.add)} aria-labelledby="solar-add">
          <div className={cx(rep.panelHead, u.band)}>
            <h2 id="solar-add">Add a consultant</h2>
          </div>
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
            <p className={u.hint}>Their days start closed. Open the ones they take, then save.</p>
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
      <div className={cx(rep.panelHead, u.band)}>
        <h2 id="solar-alerts">Lead alerts</h2>
      </div>
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
