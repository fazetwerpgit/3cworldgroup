// What the review slide lists before booking: every answer so far, grouped
// by the slide that holds it, so the homeowner can check it like an order
// summary and the rep can jump back to fix a part. Pure (reviewSummary.test.ts).
import type { DeckState } from './deckState';
import type { StepId } from './LeadFormSlide';
import { billLine, CREDIT_LABEL, leadName, PHOTO_LABELS } from './leadDisplay';
import { estimateUsage, formatAddress, formatKwh } from './usage';

/** The lead form's steps, so an Edit can open the right one. */
export type LeadStep = StepId;

export type ReviewTarget =
  | { slide: 'lead'; step: LeadStep }
  | { slide: 'calculator' | 'usage' | 'prequal' };

export type ReviewRow = { label: string; value: string; missing?: true };

export type ReviewSection = { id: string; title: string; rows: ReviewRow[]; edit: ReviewTarget };

export const NOT_ENTERED = 'Not entered';

function row(label: string, value: string): ReviewRow {
  const v = value.trim();
  return v ? { label, value: v } : { label, value: NOT_ENTERED, missing: true };
}

type ReviewInput = Pick<DeckState, 'lead' | 'monthlyBill' | 'usage' | 'photos' | 'creditTier'>;

export function reviewSections(state: ReviewInput): ReviewSection[] {
  const { lead } = state;
  const named = lead.first.trim() || lead.last.trim();
  const usage = estimateUsage(state.usage);
  // PHOTO_LABELS includes the knock app's meter slot, which the deck never uploads.
  const photos = PHOTO_LABELS.filter((p) => (state.photos as Partial<Record<string, string>>)[p.slot]);

  return [
    {
      id: 'owner',
      title: 'Homeowner',
      edit: { slide: 'lead', step: 'owner' },
      rows: [
        row('Name', named ? leadName({ first: lead.first.trim(), last: lead.last.trim() }) : ''),
        row('Phone', lead.phone),
        row('Email', lead.email),
      ],
    },
    {
      id: 'home',
      title: 'Home',
      edit: { slide: 'lead', step: 'home' },
      rows: [row('Address', formatAddress(lead))],
    },
    {
      id: 'bill',
      title: 'Electric bill',
      edit: { slide: 'calculator' },
      rows: [row('Monthly bill', state.monthlyBill > 0 ? billLine(state.monthlyBill) : '')],
    },
    {
      id: 'usage',
      title: 'Usage',
      edit: { slide: 'usage' },
      rows: [
        row('Monthly average', usage ? `${formatKwh(usage.monthlyKwh)} kWh` : ''),
        row('Annual (est.)', usage ? `${formatKwh(usage.annualKwh)} kWh` : ''),
      ],
    },
    {
      id: 'photos',
      title: 'Bill and panel photos',
      edit: { slide: 'lead', step: 'photos' },
      rows: [
        row(
          'Photos',
          photos.length ? `${photos.length} of ${PHOTO_LABELS.length}: ${photos.map((p) => p.label).join('; ')}` : ''
        ),
      ],
    },
    {
      id: 'program',
      title: 'Program',
      edit: { slide: 'prequal' },
      rows: [row('Credit range', state.creditTier ? (CREDIT_LABEL[state.creditTier] ?? '') : '')],
    },
  ];
}
