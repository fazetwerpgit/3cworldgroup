'use client';

import { ChevronRight, Pencil } from 'lucide-react';
import { useDeck } from './deckState';
import { reviewSections, type ReviewTarget } from './reviewSummary';
import s from './solarDeck.module.css';

// The review before booking: everything the homeowner gave so far, read only,
// for them to confirm ("Does all this information look accurate?"). Each part
// has an Edit that jumps back to the slide holding it; Continue goes on to
// booking.

export function ReviewSlide({ onEdit, onContinue }: { onEdit: (target: ReviewTarget) => void; onContinue: () => void }) {
  const { state } = useDeck();
  const sections = reviewSections(state);

  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Review</p>
        <h2 className={s.title}>
          Does Everything <span className={s.accent}>Look Right?</span>
        </h2>
        <p className={s.lede}>Check your information before we book your consultation.</p>
      </div>

      <div className={s.review}>
        {sections.map((section) => (
          <section key={section.id} className={s.reviewCard} aria-labelledby={`review-${section.id}`}>
            <div className={s.reviewHead}>
              <h3 id={`review-${section.id}`} className={s.reviewTitle}>
                {section.title}
              </h3>
              <button
                type="button"
                className={s.textBtn}
                onClick={() => onEdit(section.edit)}
                aria-label={`Edit ${section.title.toLowerCase()}`}
              >
                <Pencil size={14} aria-hidden />
                Edit
              </button>
            </div>
            <dl className={s.reviewList}>
              {section.rows.map((r) => (
                <div key={r.label} className={s.reviewRow}>
                  <dt>{r.label}</dt>
                  <dd data-missing={r.missing || undefined}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className={`${s.formFoot} ${s.reviewFoot}`}>
        <button type="button" className={s.primary} onClick={onContinue}>
          Looks good, book a time
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
    </>
  );
}
