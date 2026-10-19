'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDeck } from './deckState';
import {
  createBooking,
  fetchAvailability,
  formatSlotLong,
  formatSlotTime,
  groupSlotsByDay,
  hasSeveralConsultants,
  setCreditTier,
  type CreditTier,
  type SolarMode,
  type SolarSlot,
} from './solarClient';
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

const TIERS: { tier: CreditTier; score: string; name: string; points: string[] }[] = [
  {
    tier: 'purchase_600',
    score: '600+',
    name: 'Purchase',
    points: ['System Ownership & Equity', 'Federal Tax Credit Eligible', 'Maximizes Long-Term Value', 'Flexible Financing Options'],
  },
  {
    tier: 'lease_ppa_680',
    score: '680+',
    name: 'Lease / PPA',
    points: ['$0 Upfront Installation Cost', 'Complete System Maintenance', 'Immediate Rate Reduction', 'Predictable Monthly Payments'],
  },
];

/** Slide 7: the homeowner picks the credit range that fits; nothing is pulled. */
export function PrequalSlide({ onDone, onNeedLead }: { onDone: () => void; onNeedLead: () => void }) {
  const { state, update } = useDeck();
  const [pending, setPending] = useState<CreditTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (tier: CreditTier) => {
    if (!state.leadId || pending) return;
    setPending(tier);
    setError(null);
    const res = await setCreditTier(state.leadId, tier);
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    update({ creditTier: tier });
    onDone();
  };

  return (
    <>
      <div className={s.head}>
        <h2 className={s.title}>
          Pre-Qualification <span className={s.accent}>Requirements</span>
        </h2>
        <p className={s.lede}>Let&apos;s see what we can get you qualified for and what program would best suit your needs!</p>
      </div>
      <div className={s.tiers}>
        {TIERS.map((t) => (
          <button
            key={t.tier}
            type="button"
            className={s.tier}
            aria-pressed={state.creditTier === t.tier}
            disabled={!state.leadId || pending !== null}
            onClick={() => void choose(t.tier)}
          >
            <span className={s.label}>Minimum credit score</span>
            <span className={s.tierScore}>{t.score}</span>
            <span className={s.tierName}>{pending === t.tier ? 'Saving...' : t.name}</span>
            <ul className={s.tierList}>
              {t.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {!state.leadId ? <NeedsLead onBack={onNeedLead} /> : null}
      {error ? (
        <p className={s.alert} role="alert">
          {error}
        </p>
      ) : null}
      <p className={s.small}>Picking a range is not a credit check. No credit is pulled.</p>
    </>
  );
}

const DAYS = 14;

/** Slide 10: open consultation times for the next 14 days, Pacific time. */
export function BookingSlide({ onBooked, onNeedLead }: { onBooked: () => void; onNeedLead: () => void }) {
  const { state, update } = useDeck();
  const [mode, setMode] = useState<SolarMode>(state.booking?.mode ?? 'virtual');
  const [slots, setSlots] = useState<SolarSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SolarSlot | null>(null);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (which: SolarMode) => {
    setSlots(null);
    setLoadError(null);
    const from = new Date();
    const to = new Date(from.getTime() + DAYS * 24 * 60 * 60 * 1000);
    const res = await fetchAvailability(which, from, to);
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
    void load(mode);
  }, [mode, load]);

  const days = useMemo(() => groupSlotsByDay(slots ?? []), [slots]);
  const showNames = useMemo(() => hasSeveralConsultants(slots ?? []), [slots]);
  const key = (slot: SolarSlot) => `${slot.consultantUid}_${slot.start}`;

  const book = async () => {
    if (!picked || !state.leadId || booking) return;
    setBooking(true);
    setMessage(null);
    const res = await createBooking({
      leadId: state.leadId,
      mode,
      consultantUid: picked.consultantUid,
      start: picked.start,
    });
    setBooking(false);
    if (!res.ok) {
      if (res.status === 409) {
        setPicked(null);
        setMessage('That time was just taken. Pick another.');
        void load(mode);
      } else {
        setMessage(res.error);
      }
      return;
    }
    update({ booking: { id: res.data.id, start: picked.start, mode, consultantName: picked.name } });
    onBooked();
  };

  return (
    <>
      <h2 className={s.title}>
        Let&apos;s Book <span className={s.accent}>Solar Consultation</span>
      </h2>
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
              setMode(m);
            }}
          >
            {m === 'virtual' ? 'Virtual' : 'In-Person'}
          </button>
        ))}
      </div>

      {slots === null ? (
        <p className={s.note}>Loading open times...</p>
      ) : loadError ? (
        <div className={s.formFoot}>
          <p className={s.alert}>Could not load times. {loadError}</p>
          <button type="button" className={s.ghost} onClick={() => void load(mode)}>
            Try again
          </button>
        </div>
      ) : days.length === 0 ? (
        <p className={s.note}>No open {mode === 'virtual' ? 'virtual' : 'in-person'} times in the next two weeks.</p>
      ) : (
        <div className={s.days}>
          {days.map((day) => (
            <section key={day.key} className={s.day}>
              <h3>{day.label}</h3>
              <div className={s.times}>
                {day.slots.map((slot) => (
                  <button
                    key={key(slot)}
                    type="button"
                    className={s.time}
                    aria-pressed={picked ? key(picked) === key(slot) : false}
                    onClick={() => {
                      setPicked(slot);
                      setMessage(null);
                    }}
                  >
                    {formatSlotTime(slot.start)}
                    {showNames ? <small>{slot.name}</small> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className={s.bookBar}>
        {!state.leadId ? (
          <NeedsLead onBack={onNeedLead} />
        ) : (
          <>
            <button type="button" className={s.primary} disabled={!picked || booking} onClick={() => void book()}>
              {booking ? 'Booking...' : picked ? `Book ${formatSlotTime(picked.start)}` : 'Pick a time'}
            </button>
            {picked ? (
              <p className={s.note}>
                {formatSlotLong(picked.start)}
                {showNames ? ` with ${picked.name}` : ''}
              </p>
            ) : (
              <p className={s.small}>All times are Pacific.</p>
            )}
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

/** Slide 11: what was booked, and what happens next. */
export function ConfirmationSlide({ onBook }: { onBook: () => void }) {
  const { state } = useDeck();
  const b = state.booking;
  const email = state.lead.email.trim();
  return (
    <>
      <div className={s.head}>
        <svg className={s.check} viewBox="0 0 64 64" fill="none" aria-hidden>
          <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="3" />
          <path d="M19 33l9 9 17-19" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className={s.title}>
          Appointment <span className={s.accent}>Confirmation</span>
        </h2>
        <p className={s.lede}>Important details regarding your upcoming consultation</p>
      </div>
      {b ? (
        <dl className={s.confirm}>
          <dt>When</dt>
          <dd>{formatSlotLong(b.start)}</dd>
          <dt>Type</dt>
          <dd>{b.mode === 'virtual' ? 'Virtual' : 'In-Person'}</dd>
          <dt>Consultant</dt>
          <dd>{b.consultantName}</dd>
        </dl>
      ) : (
        <div className={s.formFoot}>
          <p className={s.note}>No consultation booked yet.</p>
          <button type="button" className={s.ghost} onClick={onBook}>
            Pick a time
          </button>
        </div>
      )}
      <div className={s.cols}>
        {email ? (
          <section className={s.col}>
            <span className={s.colNum}>STEP 01</span>
            <h3 className={s.colTitle}>Check Email</h3>
            <p className={s.colKicker}>A confirmation email is on its way to {email}</p>
            <p className={s.colBody}>
              Thank you! You should have received an email. Please confirm your appointment, and we are glad to be of
              service to you.
            </p>
          </section>
        ) : null}
        <section className={s.col}>
          <span className={s.colNum}>{email ? 'STEP 02' : 'STEP 01'}</span>
          <h3 className={s.colTitle}>Courtesy Call</h3>
          <p className={s.colKicker}>1-2 Hours Prior</p>
          <p className={s.colBody}>You will receive a courtesy call 1-2 hours prior to your appointment from the consultant.</p>
        </section>
        <section className={s.col}>
          <span className={s.colNum}>STATUS</span>
          <h3 className={s.colTitle}>All Set!</h3>
          <p className={s.colKicker}>We&apos;re Ready for You</p>
        </section>
      </div>
    </>
  );
}
