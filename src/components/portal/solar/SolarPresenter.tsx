'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DeckProvider, hasLeadInProgress, useDeck } from './deckState';
import { finishLead } from './solarClient';
import { overrideStatusBar } from '@/lib/app/statusBar';
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
// position:fixed layers, so iOS has nothing to clip. Swipe, arrow keys, the
// Back/Next buttons or the slide list (the counter) move between slides.

type SlideId =
  | 'intro' | 'options' | 'partners' | 'calculator' | 'lead' | 'bill' | 'prequal' | 'steps'
  | 'needs' | 'booking' | 'confirm' | 'appendix' | 'moving' | 'fast' | 'price';

const ORDER: SlideId[] = [
  'intro', 'options', 'partners', 'calculator', 'lead', 'bill', 'prequal', 'steps',
  'needs', 'booking', 'confirm', 'appendix', 'moving', 'fast', 'price',
];

/** What the slide list calls each slide; `true` marks the ones the homeowner fills in. */
const SLIDES: Record<SlideId, { title: string; interactive?: true }> = {
  intro: { title: 'Giving clients the options they deserve' },
  options: { title: 'Time to take a look at your options' },
  partners: { title: 'We have partnered with' },
  calculator: { title: 'How much do you currently spend?', interactive: true },
  lead: { title: "Let's gather some info", interactive: true },
  bill: { title: 'Evaluation of your bill' },
  prequal: { title: 'Pre-qualification', interactive: true },
  steps: { title: 'Make the switch in three easy steps' },
  needs: { title: 'What we need to get started' },
  booking: { title: 'Book your solar consultation', interactive: true },
  confirm: { title: 'Appointment confirmation', interactive: true },
  appendix: { title: 'Appendix' },
  moving: { title: "You're moving!" },
  fast: { title: 'We make the process fast' },
  price: { title: "We will beat anybody's prices" },
};

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
  const [listOpen, setListOpen] = useState(false);
  const counterRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ index: number; dir: 'fwd' | 'back' }>({ index: 0, dir: 'fwd' });
  const { index, dir } = pos;
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // A light deck inside the dark portal: in the iOS app the status bar text
  // goes dark (black) while it is up, or the clock vanishes into the page.
  useEffect(() => overrideStatusBar('dark'), []);

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
    setListOpen(false);
    if (hasLeadInProgress(state)) setConfirming(true);
    else startNewCustomer();
  };

  const closeList = useCallback((refocus: boolean) => {
    setListOpen(false);
    if (refocus) requestAnimationFrame(() => counterRef.current?.focus());
  }, []);
  const pickSlide = (i: number) => {
    go(i);
    closeList(true);
  };

  // Tab stays inside the open list.
  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = e.currentTarget.querySelectorAll<HTMLElement>('button');
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };

  // The list opens on the current slide, keyboard focus on it.
  useEffect(() => {
    if (!listOpen) return;
    const current = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    current?.focus();
    current?.scrollIntoView({ block: 'nearest' });
  }, [listOpen]);

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
        if (listOpen) closeList(true);
        return;
      }
      if (listOpen) return;
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
  }, [next, prev, listOpen, closeList]);

  // Each slide opens at its top.
  useEffect(() => {
    stageRef.current?.querySelector<HTMLElement>('[data-slide]')?.scrollTo({ top: 0 });
  }, [index]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (listOpen || e.touches.length !== 1 || isTypingTarget(e.target)) {
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

  const first = state.lead.first.trim();
  return (
    <div className={s.root} data-solar-deck>
      <header className={s.top}>
        {confirming ? (
          <div className={s.topConfirm} role="group" aria-label="Start a new customer">
            <span>Clear {first ? `${first}'s` : 'this'} info?</span>
            <button type="button" ref={cancelRef} className={s.chip} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className={s.topConfirmGo} onClick={startNewCustomer}>
              New customer
            </button>
          </div>
        ) : (
          <>
            <div className={s.topSide}>
              <Link
                className={s.iconBtn}
                href="/portal/solar"
                aria-label="Exit the presentation"
                title="Exit"
                onClick={() => {
                  // Leaving with a saved, unbooked lead: send its alert now.
                  if (state.leadId && !state.booking) void finishLead(state.leadId);
                }}
              >
                <X size={18} aria-hidden />
              </Link>
              <button type="button" className={s.chip} onClick={prev} disabled={index === 0} aria-label="Previous slide">
                <ChevronLeft size={18} aria-hidden />
                <span className={s.chipText}>Back</span>
              </button>
            </div>

            <button
              type="button"
              ref={counterRef}
              className={s.counter}
              aria-haspopup="dialog"
              aria-expanded={listOpen}
              aria-label={`Slide ${index + 1} of ${ORDER.length}. Open the slide list`}
              onClick={() => (listOpen ? closeList(false) : setListOpen(true))}
            >
              <span aria-live="polite">
                {index + 1} / {ORDER.length}
              </span>
              <ChevronDown size={16} aria-hidden className={s.counterIcon} />
            </button>

            <div className={`${s.topSide} ${s.topSideEnd}`}>
              <button
                type="button"
                className={s.next}
                onClick={next}
                disabled={index === ORDER.length - 1}
                aria-label="Next slide"
              >
                <span className={s.chipText}>Next</span>
                <ChevronRight size={18} aria-hidden />
              </button>
              <Image className={s.logo} src="/solar/globe.webp" alt="3C World Group" width={36} height={36} />
            </div>
          </>
        )}
        <div className={s.track} aria-hidden>
          <div className={s.fill} style={{ transform: `scaleX(${(index + 1) / ORDER.length})` }} />
        </div>
      </header>

      <div className={s.stage} ref={stageRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <section
          key={id}
          className={s.slide}
          data-slide={id}
          data-dir={dir}
          aria-roledescription="slide"
          aria-label={`Slide ${index + 1} of ${ORDER.length}: ${SLIDES[id].title}`}
        >
          <div className={`${s.inner} ${TOP_ALIGNED[id] ? s.innerTop : ''}`}>{content}</div>
          <footer className={s.legal}>
            <span className={s.legalBrand}>3C World Group</span>
            <span>3C Companies Corporation / Confidential</span>
          </footer>
        </section>

        {listOpen ? (
          <>
            <button type="button" className={s.scrim} aria-label="Close the slide list" tabIndex={-1} onClick={() => closeList(true)} />
            <div className={s.sheet} ref={listRef} role="dialog" aria-modal="true" aria-label="Slides" onKeyDown={trapFocus}>
              <div className={s.sheetHead}>
                <span className={s.eyebrow}>Slides</span>
                <button type="button" className={s.iconBtn} aria-label="Close the slide list" onClick={() => closeList(true)}>
                  <X size={16} aria-hidden />
                </button>
              </div>
              <ol className={s.sheetList}>
                {ORDER.map((slideId, i) => (
                  <li key={slideId}>
                    <button
                      type="button"
                      className={s.sheetItem}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => pickSlide(i)}
                    >
                      <span className={s.sheetNum}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={s.sheetTitle}>{SLIDES[slideId].title}</span>
                      {SLIDES[slideId].interactive ? <span className={s.sheetTag}>Interactive</span> : null}
                    </button>
                  </li>
                ))}
              </ol>
              <div className={s.sheetFoot}>
                <button type="button" className={s.ghost} onClick={requestNewCustomer}>
                  New customer
                </button>
                <span className={s.small}>Arrow keys move between slides.</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
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
        <p style={{ color: '#46536f', margin: '0 0 20px' }}>Ask your manager if you should have access.</p>
        <Link href="/portal/dashboard">Back to dashboard</Link>
      </div>
    </div>
  );
}
