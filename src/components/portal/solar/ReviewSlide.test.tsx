// @vitest-environment jsdom
//
// The review slide before booking: every answer so far, read only, each part
// with an Edit back to the slide that holds it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_USAGE } from './usage';
import { NOT_ENTERED, reviewSections } from './reviewSummary';

const FILLED = {
  lead: {
    first: ' Ana ',
    last: 'Ruiz',
    phone: '(559) 555-0101',
    email: 'ana@example.com',
    address: '12 Elm St',
    city: 'Fresno',
    state: 'ca',
    zip: '93701',
  },
  monthlyBill: 212.5,
  usage: { ...EMPTY_USAGE, months: [...EMPTY_USAGE.months], monthly: 950 },
  photos: { billPage1: 'form-attachments/u/solar-lead/x/billPage1/a.jpg', panel: 'form-attachments/u/solar-lead/x/panel/b.jpg' },
  creditTier: 'lease_ppa_680' as const,
};

const EMPTY = {
  lead: { first: '', last: '', phone: '', email: '', address: '', city: '', state: '', zip: '' },
  monthlyBill: 0,
  usage: { ...EMPTY_USAGE, months: [...EMPTY_USAGE.months] },
  photos: {},
  creditTier: null,
};

const deck = vi.hoisted(() => ({ state: {} as unknown }));
vi.mock('./deckState', () => ({ useDeck: () => ({ state: deck.state, update: vi.fn() }) }));

import { ReviewSlide } from './ReviewSlide';
import { contactKey, type LeadFields } from './solarClient';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('reviewSections', () => {
  it('lists every answer under the slide that holds it', () => {
    const sections = reviewSections(FILLED);
    const flat = Object.fromEntries(sections.map((sec) => [sec.id, sec.rows.map((r) => `${r.label}: ${r.value}`)]));
    expect(flat).toEqual({
      owner: ['Name: Ana Ruiz', 'Phone: (559) 555-0101', 'Email: ana@example.com'],
      home: ['Address: 12 Elm St, Fresno, CA 93701'],
      bill: ['Monthly bill: $212.50/mo'],
      usage: ['Monthly average: 950 kWh', 'Annual (est.): 11,400 kWh'],
      photos: ['Photos: 2 of 3: Bill, first page; Electric panel'],
      program: ['Credit range: Lease, PPA or Purchase, 680+'],
    });
    expect(sections.map((sec) => sec.edit)).toEqual([
      { slide: 'lead', step: 'owner' },
      { slide: 'lead', step: 'home' },
      { slide: 'calculator' },
      { slide: 'usage' },
      { slide: 'lead', step: 'photos' },
      { slide: 'prequal' },
    ]);
  });

  it('marks what is still blank', () => {
    const rows = reviewSections(EMPTY).flatMap((sec) => sec.rows);
    expect(rows.every((r) => r.missing && r.value === NOT_ENTERED)).toBe(true);
  });
});

describe('ReviewSlide', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows the answers read only and jumps back on Edit', () => {
    deck.state = FILLED;
    const onEdit = vi.fn();
    const onContinue = vi.fn();
    act(() => root.render(<ReviewSlide onEdit={onEdit} onContinue={onContinue} />));

    expect(host.querySelectorAll('input')).toHaveLength(0);
    expect(host.textContent).toContain('Ana Ruiz');
    expect(host.textContent).toContain('12 Elm St, Fresno, CA 93701');

    const editHome = host.querySelector<HTMLButtonElement>('button[aria-label="Edit home"]');
    act(() => editHome?.click());
    expect(onEdit).toHaveBeenCalledWith({ slide: 'lead', step: 'home' });

    const go = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('book a time'));
    act(() => go?.click());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('flags a contact change that never reached the saved lead', () => {
    const savedContact = contactKey(FILLED.lead as LeadFields);
    deck.state = { ...FILLED, leadId: 'lead1', savedContact };
    act(() => root.render(<ReviewSlide onEdit={vi.fn()} onContinue={vi.fn()} />));
    expect(host.querySelector('[data-testid="solar-review-unsaved"]')).toBeNull();

    deck.state = { ...FILLED, lead: { ...FILLED.lead, phone: '(559) 555-0199' }, leadId: 'lead1', savedContact };
    act(() => root.render(<ReviewSlide onEdit={vi.fn()} onContinue={vi.fn()} />));
    expect(host.querySelector('[data-testid="solar-review-unsaved"]')?.textContent).toMatch(/not saved to the lead/);
  });
});
