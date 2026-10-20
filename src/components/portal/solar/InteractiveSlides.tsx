'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, MapPin, Video } from 'lucide-react';
import { useDeck } from './deckState';
import {
  bookTime,
  fetchAvailability,
  formatSlotLong,
  formatSlotTime,
  groupSlotsByDay,
  markLowCredit,
  setCreditTier,
  slotsInWindow,
  type CreditTier,
  type SlotTime,
  type SolarMode,
  type SolarSlot,
} from './solarClient';
import {
  DEFAULT_CONSULTANT_TZ,
  US_TIMEZONES,
  bookingWindowEnd,
  customerZone,
  deviceTimeZone,
  zoneForState,
  zoneName,
} from '@/lib/solar/timezones';
import s from './solarDeck.module.css';

function NeedsLead({ onBack }: { onBack: () => void }) {
  return (
    <div className={s.formFoot}>
      <p className={s.note}>Save the homeowner&apos;s info first.</p>
      <button type="button" className={s.ghost} onClick={onBack}>
        Go to the info form
      </button>
    </div>
  );
}

/** What the homeowner picks on the prequal slide: a credit tier, or Under 600 (no program fits). */
export type PrequalChoice = CreditTier | 'under_600';

/**
 * The prequal cards, high to low (Jeremy's slide 73, no overlaps). The two
 * programs are cards; Under 600 sits below them as a quiet full-width row.
 * Wire values stay purchase_600 / lease_ppa_680; Under 600 sends no tier.
 */
export const TIERS: { tier: CreditTier; score: string; name: string; points: string[] }[] = [
  {
    tier: 'lease_ppa_680',
    score: '680+',
    name: 'Lease, PPA or Purchase',
    points: [
      '$0 Upfront Installation Cost',
      'Complete System Maintenance',
      'Immediate Rate Reduction',
      'Predictable Monthly Payments',
      'Or Purchase and Own It',
    ],
  },
  {
    tier: 'purchase_600',
    score: '600–679',
    name: 'Purchase',
    points: ['System Ownership & Equity', 'Federal Tax Credit Eligible', 'Maximizes Long-Term Value', 'Financing Through Credit Human'],
  },
];

/**
 * Slide 8: the homeowner picks the credit range that fits; nothing is pulled.
 * Under 600 closes the lead as no sale (low credit) and shows a polite end
 * state; Change answer brings the cards back, and a tier reopens the lead.
 */
export function PrequalSlide({
  onDone,
  onNeedLead,
  onNewCustomer,
}: {
  onDone: () => void;
  onNeedLead: () => void;
  onNewCustomer: () => void;
}) {
  const { state, update } = useDeck();
  const [pending, setPending] = useState<PrequalChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Under 600 tapped while a consultation is booked: ask before it is cancelled.
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Change answer on the end state: the cards again, Under 600 still picked.
  const [changing, setChanging] = useState(false);

  const choose = async (choice: PrequalChoice) => {
    if (!state.leadId || pending) return;
    setError(null);
    if (choice === 'under_600') {
      if (state.lowCredit) {
        setChanging(false);
        return;
      }
      if (state.booking && !confirmCancel) {
        setConfirmCancel(true);
        return;
      }
      setConfirmCancel(false);
      setPending(choice);
      const res = await markLowCredit(state.leadId);
      setPending(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      update({ lowCredit: true, creditTier: null, booking: null });
      setChanging(false);
      return;
    }
    setConfirmCancel(false);
    setPending(choice);
    const res = await setCreditTier(state.leadId, choice);
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    update({ creditTier: choice, lowCredit: false });
    setChanging(false);
    onDone();
  };

  if (state.lowCredit && !changing) {
    return (
      <>
        <div className={s.head}>
          <p className={s.eyebrow}>Program fit</p>
          <h2 className={s.title}>
            Not a fit <span className={s.accent}>right now</span>
          </h2>
          <p className={s.lede}>
            Thanks for your time today. Our solar programs start at a 600 credit score, so we can&apos;t move forward at
            this time.
          </p>
        </div>
        <div className={s.endActions}>
          <button type="button" className={s.primary} onClick={onNewCustomer}>
            New customer
          </button>
          <button type="button" className={s.ghost} onClick={() => setChanging(true)}>
            Change answer
          </button>
        </div>
        <p className={s.small}>Saved to this lead as no sale: low credit.</p>
      </>
    );
  }

  const busy = !state.leadId || pending !== null;
  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Program fit</p>
        <h2 className={s.title}>
          Pre-Qualification <span className={s.accent}>Requirements</span>
        </h2>
        <p className={s.lede}>Let&apos;s see what we can get you qualified for and what program would best suit your needs!</p>
      </div>
      <div className={s.tiers} role="group" aria-label="Credit score range">
        {TIERS.map((t) => {
          const on = state.creditTier === t.tier;
          return (
            <button
              key={t.tier}
              type="button"
              className={s.tier}
              aria-pressed={on}
              disabled={busy}
              onClick={() => void choose(t.tier)}
            >
              <span className={s.tierTop}>
                <span className={s.label}>Credit score</span>
                <span className={s.radio} aria-hidden>
                  {on ? <Check size={14} strokeWidth={3} /> : null}
                </span>
              </span>
              <span className={s.tierScore}>{t.score}</span>
              <span className={s.tierName}>{pending === t.tier ? 'Saving...' : t.name}</span>
              <ul className={s.tierList}>
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </button>
          );
        })}
        <button
          type="button"
          className={`${s.tier} ${s.tierQuiet}`}
          aria-pressed={state.lowCredit}
          disabled={busy}
          onClick={() => void choose('under_600')}
        >
          <span className={s.tierQuietScore}>
            <span className={s.label}>Credit score</span>
            <span className={s.tierQuietValue}>Under 600</span>
          </span>
          <span className={s.tierQuietText}>
            <span className={s.tierQuietName}>{pending === 'under_600' ? 'Saving...' : 'Not qualified right now'}</span>
            <span className={s.tierQuietNote}>No program fits today.</span>
          </span>
          <span className={s.radio} aria-hidden>
            {state.lowCredit ? <Check size={14} strokeWidth={3} /> : null}
          </span>
        </button>
      </div>
      {!state.leadId ? (
        <NeedsLead onBack={onNeedLead} />
      ) : confirmCancel && state.booking ? (
        <div className={s.formFoot} role="group" aria-label="Cancel the booked consultation?">
          <p className={s.note}>
            This also cancels the consultation booked for{' '}
            {formatSlotLong(state.booking.start, state.booking.tz ?? customerZone(state.lead.state))}.
          </p>
          <button type="button" className={s.ghost} onClick={() => setConfirmCancel(false)}>
            Keep booking
          </button>
          <button type="button" className={s.ghost} onClick={() => void choose('under_600')}>
            Cancel it
          </button>
        </div>
      ) : (
        <p className={`${s.small} ${s.center}`}>
          {state.lowCredit
            ? 'Tap a program to reopen this lead.'
            : state.creditTier
              ? 'Saved with this lead. Tap another card to change it.'
              : 'Tap the program that fits.'}
        </p>
      )}
      {error ? (
        <p className={s.alert} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Booking slide stand-in when the homeowner didn't pre-qualify: nothing to book. */
export function NotQualifiedBooking({ onPrequal }: { onPrequal: () => void }) {
  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Consultation</p>
        <h2 className={s.title}>
          Nothing to <span className={s.accent}>book</span>
        </h2>
        <p className={s.lede}>This homeowner didn&apos;t pre-qualify (credit score under 600).</p>
      </div>
      <div className={s.endActions}>
        <button type="button" className={s.ghost} onClick={onPrequal}>
          Change the credit answer
        </button>
      </div>
    </>
  );
}

/**
 * Slide 10: open consultation times for the next 14 days (the booking window),
 * in the customer's time zone: the lead's state, else the rep's device zone
 * with a switcher. Each time shows once; booking picks the consultant
 * (bookTime) and stores the customer's zone with it.
 */
export function BookingSlide({ onBooked, onNeedLead }: { onBooked: () => void; onNeedLead: () => void }) {
  const { state, update } = useDeck();
  const [mode, setMode] = useState<SolarMode>(state.booking?.mode ?? 'virtual');
  const [slots, setSlots] = useState<SolarSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SlotTime | null>(null);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  // The customer's zone. A known state decides it; otherwise the rep's phone
  // zone, which the rep can switch.
  const stateZone = zoneForState(state.lead.state);
  const [device] = useState(() => deviceTimeZone() ?? DEFAULT_CONSULTANT_TZ);
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const tz = stateZone ?? chosenZone ?? device;
  const zoneOptions = useMemo(
    () => [...US_TIMEZONES.map((z) => z.value), ...(US_TIMEZONES.some((z) => z.value === device) ? [] : [device])],
    [device]
  );

  const load = useCallback(async (which: SolarMode, zone: string) => {
    setSlots(null);
    setLoadError(null);
    const from = new Date();
    const to = bookingWindowEnd(from, zone);
    const res = await fetchAvailability(which, from, to, zone);
    if (!res.ok) {
      setLoadError(res.error);
      setSlots([]);
      return;
    }
    setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
  }, []);

  useEffect(() => {
    // Fetch on mount and on each mode switch; the result lands asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(mode, tz);
  }, [mode, tz, load]);

  const days = useMemo(() => groupSlotsByDay(slotsInWindow(slots ?? [], tz), tz), [slots, tz]);
  // The day on show: the one picked, else the picked time's, else the first open day.
  const day =
    days.find((d) => d.key === dayKey) ??
    days.find((d) => d.times.some((x) => x.start === picked?.start)) ??
    days[0] ??
    null;

  const book = async () => {
    if (!picked || !state.leadId || booking) return;
    setBooking(true);
    setMessage(null);
    const res = await bookTime(picked, state.leadId, mode, undefined, tz);
    setBooking(false);
    if (!res.ok) {
      if (res.taken) {
        setPicked(null);
        setMessage('That time was just taken. Pick another.');
        void load(mode, tz);
      } else {
        setMessage(res.error);
      }
      return;
    }
    update({ booking: { id: res.id, start: res.slot.start, mode, consultantName: res.slot.name, tz: res.customerTz ?? tz } });
    onBooked();
  };

  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Consultation</p>
        <h2 className={s.title}>
          Let&apos;s Book <span className={s.accent}>Solar Consultation</span>
        </h2>
      </div>
      <div className={s.book}>
        <div className={s.bookSide}>
          <div className={s.seg} role="group" aria-label="Consultation type">
            {(['virtual', 'in_person'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  if (m === mode) return;
                  setPicked(null);
                  setMessage(null);
                  setDayKey(null);
                  setMode(m);
                }}
              >
                {m === 'virtual' ? <Video size={16} aria-hidden /> : <MapPin size={16} aria-hidden />}
                {m === 'virtual' ? 'Virtual' : 'In-Person'}
              </button>
            ))}
          </div>
          <div className={s.dayList} role="group" aria-label="Day">
            <span className={s.label}>Day</span>
            {slots === null ? (
              <p className={s.note}>Loading...</p>
            ) : days.length === 0 ? (
              <p className={s.note}>No open days.</p>
            ) : (
              <div className={s.dayScroll}>
                {days.map((d) => {
                  const [weekday, date] = d.label.split(', ');
                  return (
                    <button
                      key={d.key}
                      type="button"
                      className={s.dayBtn}
                      aria-pressed={day?.key === d.key}
                      aria-label={`${d.label}, ${d.times.length} open time${d.times.length === 1 ? '' : 's'}`}
                      onClick={() => setDayKey(d.key)}
                    >
                      <span>{weekday.slice(0, 3)}</span>
                      <strong>{date}</strong>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <section className={s.timesPanel} aria-label="Times available">
          <div className={s.timesHead}>
            <span className={s.label}>{day ? `Times on ${day.label}` : 'Times available'}</span>
            <span className={s.zone}>
              <Clock size={14} aria-hidden />
              {stateZone ? (
                zoneName(tz)
              ) : (
                <select
                  className={s.zoneSelect}
                  value={tz}
                  aria-label="Customer time zone"
                  onChange={(e) => {
                    setChosenZone(e.target.value);
                    setDayKey(null);
                  }}
                >
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {zoneName(z)}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </div>
          {slots === null ? (
            <p className={s.note}>Loading open times...</p>
          ) : loadError ? (
            <div className={s.formFoot}>
              <p className={s.alert}>Could not load times. {loadError}</p>
              <button type="button" className={s.ghost} onClick={() => void load(mode, tz)}>
                Try again
              </button>
            </div>
          ) : !day ? (
            <p className={s.note}>No open {mode === 'virtual' ? 'virtual' : 'in-person'} times in the next two weeks.</p>
          ) : (
            <div className={s.times}>
              {day.times.map((time) => (
                <button
                  key={time.start}
                  type="button"
                  className={s.time}
                  aria-pressed={picked?.start === time.start}
                  onClick={() => {
                    setPicked(time);
                    setMessage(null);
                  }}
                >
                  {formatSlotTime(time.start, tz)}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className={s.bookBar}>
        {!state.leadId ? (
          <NeedsLead onBack={onNeedLead} />
        ) : (
          <>
            <p className={picked ? s.bookPicked : s.note}>
              {picked ? formatSlotLong(picked.start, tz) : 'Pick a day and a time.'}
            </p>
            <button
              type="button"
              className={s.primary}
              disabled={!picked || booking}
              aria-busy={booking || undefined}
              onClick={() => void book()}
            >
              {booking ? 'Booking...' : picked ? `Book ${formatSlotTime(picked.start, tz)}` : 'Book consultation'}
            </button>
          </>
        )}
        {message ? (
          <p className={s.alert} role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Slide 11: what was booked, what happens next, and the way on to the next homeowner. */
export function ConfirmationSlide({ onBook, onNewCustomer }: { onBook: () => void; onNewCustomer: () => void }) {
  const { state } = useDeck();
  const b = state.booking;
  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Confirmed</p>
        <h2 className={s.title}>
          Appointment <span className={s.accent}>Confirmation</span>
        </h2>
        <p className={s.lede}>Important details regarding your upcoming consultation</p>
      </div>
      <div className={s.confirmGrid}>
        <section className={s.card} aria-label="Status">
          <span className={s.checkWrap} data-on={b ? true : undefined} aria-hidden>
            <Check size={22} strokeWidth={2.5} />
          </span>
          <span className={s.label}>Status</span>
          <h3 className={s.statusTitle}>All Set!</h3>
          <p className={s.statusKicker}>We&apos;re Ready for You</p>
          <hr className={s.rule} />
          {b ? (
            <dl className={s.confirm}>
              <dt>When</dt>
              <dd>{formatSlotLong(b.start, b.tz ?? customerZone(state.lead.state))}</dd>
              <dt>Type</dt>
              <dd>{b.mode === 'virtual' ? 'Virtual' : 'In-Person'}</dd>
              <dt>Consultant</dt>
              <dd>{b.consultantName}</dd>
            </dl>
          ) : (
            <div className={s.noBooking}>
              <p className={s.note}>No time booked yet</p>
              <button type="button" className={s.textBtn} onClick={onBook}>
                Book a consultation
              </button>
            </div>
          )}
        </section>
        <ol className={s.nextSteps}>
          <li>
            <span className={s.stepBig}>01</span>
            <div>
              <h3 className={s.colTitle}>Check Email</h3>
              <p className={s.colKicker}>Confirm Appointment</p>
              <p className={s.colBody}>
                Thank you! You should have received an email. Please confirm your appointment, and we are glad to be of
                service to you.
              </p>
            </div>
          </li>
          <li>
            <span className={s.stepBig}>02</span>
            <div>
              <h3 className={s.colTitle}>Courtesy Call</h3>
              <p className={s.colKicker}>1-2 Hours Prior</p>
              <p className={s.colBody}>You will receive a courtesy call 1-2 hours prior to your appointment from the consultant.</p>
            </div>
          </li>
          <li className={s.nextStepsFoot}>
            <button type="button" className={b ? s.primary : s.ghost} onClick={onNewCustomer}>
              New customer
            </button>
          </li>
        </ol>
      </div>
    </>
  );
}
