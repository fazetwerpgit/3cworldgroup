'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DeckProvider, hasLeadInProgress, useDeck } from './deckState';
import { finishLead } from './solarClient';
import { CalculatorSlide } from './CalculatorSlide';
import { LeadFormSlide } from './LeadFormSlide';
import { BookingSlide, ConfirmationSlide, PrequalSlide } from './InteractiveSlides';
import {
  AppendixSlide,
  BillSlide,
  FastSlide,
  IntroSlide,
  MovingSlide,
  NeedsSlide,
  OptionsSlide,
  PartnersSlide,
  PriceSlide,
  StepsSlide,
} from './StaticSlides';
import s from './solarDeck.module.css';

// The full-screen solar deck a rep hands to a homeowner. It sits outside the
// rep shell (no <main> scroller), fills the viewport itself and keeps no
// position:fixed layers, so iOS has nothing to clip. Swipe, arrow keys or the
// bottom buttons move between slides.

type SlideId =
  | 'intro' | 'options' | 'partners' | 'calculator' | 'lead' | 'bill' | 'prequal' | 'steps'
  | 'needs' | 'booking' | 'confirm' | 'appendix' | 'moving' | 'fast' | 'price';

const ORDER: SlideId[] = [
  'intro', 'options', 'partners', 'calculator', 'lead', 'bill', 'prequal', 'steps',
  'needs', 'booking', 'confirm', 'appendix', 'moving', 'fast', 'price',
];

/** Slides whose content starts at the top (long forms) instead of centering. */
const TOP_ALIGNED: Partial<Record<SlideId, true>> = { lead: true, booking: true };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function Deck() {
  const { state, reset } = useDeck();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ index: number; dir: 'fwd' | 'back' }>({ index: 0, dir: 'fwd' });
  const { index, dir } = pos;
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = useCallback((target: number) => {
    setPos((cur) => {
      const clamped = Math.max(0, Math.min(ORDER.length - 1, target));
      if (clamped === cur.index) return cur;
      return { index: clamped, dir: clamped > cur.index ? 'fwd' : 'back' };
    });
  }, []);
  const goTo = useCallback((id: SlideId) => go(ORDER.indexOf(id)), [go]);

  // Done with this homeowner: the server sends the lead alert if a booking
  // didn't (idempotent), then every field, id and photo is cleared.
  const startNewCustomer = useCallback(() => {
    if (state.leadId) void finishLead(state.leadId);
    reset();
    setConfirming(false);
    go(0);
  }, [state.leadId, reset, go]);
  const requestNewCustomer = () => {
    if (hasLeadInProgress(state)) setConfirming(true);
    else startNewCustomer();
  };

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);
  const next = useCallback(() => setPos((cur) => (cur.index >= ORDER.length - 1 ? cur : { index: cur.index + 1, dir: 'fwd' })), []);
  const prev = useCallback(() => setPos((cur) => (cur.index <= 0 ? cur : { index: cur.index - 1, dir: 'back' })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        setConfirming(false);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // Each slide opens at its top.
  useEffect(() => {
    stageRef.current?.querySelector<HTMLElement>('[data-slide]')?.scrollTo({ top: 0 });
  }, [index]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || isTypingTarget(e.target)) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.t > 800) return;
    if (dx < 0) next();
    else prev();
  };

  const id = ORDER[index];
  let content: ReactNode;
  switch (id) {
    case 'intro': content = <IntroSlide />; break;
    case 'options': content = <OptionsSlide />; break;
    case 'partners': content = <PartnersSlide />; break;
    case 'calculator': content = <CalculatorSlide />; break;
    case 'lead': content = <LeadFormSlide onSaved={() => goTo('bill')} />; break;
    case 'bill': content = <BillSlide />; break;
    case 'prequal': content = <PrequalSlide onDone={() => goTo('steps')} onNeedLead={() => goTo('lead')} />; break;
    case 'steps': content = <StepsSlide />; break;
    case 'needs': content = <NeedsSlide />; break;
    case 'booking': content = <BookingSlide onBooked={() => goTo('confirm')} onNeedLead={() => goTo('lead')} />; break;
    case 'confirm': content = <ConfirmationSlide onBook={() => goTo('booking')} onNewCustomer={requestNewCustomer} />; break;
    case 'appendix': content = <AppendixSlide />; break;
    case 'moving': content = <MovingSlide />; break;
    case 'fast': content = <FastSlide />; break;
    case 'price': content = <PriceSlide />; break;
  }

  return (
    <div className={s.root} data-solar-deck>
      <header className={s.top}>
        {confirming ? (
          <div className={s.topConfirm} role="group" aria-label="Start a new customer">
            <span>Clear {state.lead.first.trim() ? `${state.lead.first.trim()}'s` : 'this'} info?</span>
            <button type="button" ref={cancelRef} className={s.exit} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className={s.topConfirmGo} onClick={startNewCustomer}>
              New customer
            </button>
          </div>
        ) : (
          <>
            <div className={s.brand}>
              <Image src="/solar/globe.webp" alt="" width={28} height={28} />
              3C World Group
            </div>
            <div className={s.topActions}>
              <button type="button" className={s.exit} onClick={requestNewCustomer}>
                New customer
              </button>
              <Link
                className={s.exit}
                href="/portal/solar"
                onClick={() => {
                  // Leaving with a saved, unbooked lead: send its alert now.
                  if (state.leadId && !state.booking) void finishLead(state.leadId);
                }}
              >
                Exit
              </Link>
            </div>
          </>
        )}
      </header>

      <div className={s.stage} ref={stageRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <section
          key={id}
          className={s.slide}
          data-slide={id}
          data-dir={dir}
          aria-roledescription="slide"
          aria-label={`Slide ${index + 1} of ${ORDER.length}`}
        >
          <div className={`${s.inner} ${TOP_ALIGNED[id] ? s.innerTop : ''}`}>{content}</div>
          <footer className={s.legal}>
            <span>3C Companies Corporation</span>
            <span aria-hidden>/</span>
            <span>Confidential</span>
          </footer>
        </section>
      </div>

      <nav className={s.bottom} aria-label="Slides">
        <button type="button" className={s.navBtn} onClick={prev} disabled={index === 0} aria-label="Previous slide">
          <ChevronLeft size={20} aria-hidden />
          <span>Back</span>
        </button>
        <div className={s.progress}>
          <span className={s.count} aria-live="polite">
            {index + 1} / {ORDER.length}
          </span>
          <div className={s.track} aria-hidden>
            <div className={s.fill} style={{ transform: `scaleX(${(index + 1) / ORDER.length})` }} />
          </div>
        </div>
        <button
          type="button"
          className={`${s.navBtn} ${s.navNext}`}
          onClick={next}
          disabled={index === ORDER.length - 1}
          aria-label="Next slide"
        >
          <span>Next</span>
          <ChevronRight size={20} aria-hidden />
        </button>
      </nav>
    </div>
  );
}

export function SolarPresenter() {
  return (
    <DeckProvider>
      <Deck />
    </DeckProvider>
  );
}

export function SolarNoAccess() {
  return (
    <div className={s.gate}>
      <div>
        <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>Solar isn&apos;t on your account</p>
        <p style={{ color: '#94a3b8', margin: '0 0 20px' }}>Ask your manager if you should have access.</p>
        <Link href="/portal/dashboard">Back to dashboard</Link>
      </div>
    </div>
  );
}
