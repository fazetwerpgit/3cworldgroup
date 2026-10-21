// @vitest-environment jsdom
//
// The admin lead sheet's stage picker: No sale on a lead with a live booking
// cancels that consultation on the server, so the sheet asks first.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolarLeadView } from '@/lib/solar/leadView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const api = vi.hoisted(() => ({ setLeadStage: vi.fn() }));
vi.mock('@/components/portal/solar/solarClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/portal/solar/solarClient')>()),
  setLeadStage: api.setLeadStage,
}));

import { LeadSheet, stageChangeCancelsBooking } from './SolarLeads';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOOKING = {
  id: 'b1', start: '2026-10-22T17:00:00.000Z', end: null, mode: 'virtual' as const,
  consultantUid: 'con', consultantName: 'Jeremy', tz: 'America/Los_Angeles', customerTz: 'America/Los_Angeles',
};

function lead(patch: Partial<SolarLeadView> = {}): SolarLeadView {
  return {
    id: 'L1', status: 'booked', first: 'Ana', last: 'Ruiz', address: '1 Main St', city: 'Fresno', state: 'CA',
    zip: '93701', phone: '5595551234', email: 'ana@example.com', monthlyBill: 150, creditTier: null, photos: {},
    source: 'portal', campaignId: null, repUid: 'rep1', repName: 'Rep One', createdAt: null, updatedAt: null, booking: BOOKING,
    stage: null, stageOutcome: null, stageHistory: [], roofType: null, heavyShade: null, needsReview: false,
    monthlyKwh: null, usage: null, ...patch,
  };
}

describe('stageChangeCancelsBooking', () => {
  it('only no sale on a lead with a live booking, and only as a change', () => {
    expect(stageChangeCancelsBooking('appointment_demoed:no_sale', lead())).toBe(true);
    expect(stageChangeCancelsBooking('appointment_demoed:no_sale', lead({ booking: null }))).toBe(false);
    expect(stageChangeCancelsBooking('appointment_demoed:sale', lead())).toBe(false);
    expect(stageChangeCancelsBooking('appointment_demoed:proposal_sent', lead())).toBe(false);
    expect(stageChangeCancelsBooking('site_survey', lead())).toBe(false);
    expect(stageChangeCancelsBooking('none', lead())).toBe(false);
    expect(
      stageChangeCancelsBooking('appointment_demoed:no_sale', lead({ stage: 'appointment_demoed', stageOutcome: 'no_sale' }))
    ).toBe(false);
  });
});

describe('LeadSheet stage picker', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChanged = vi.fn();

  const render = (l: SolarLeadView, ownerViewer = false) =>
    act(() =>
      root.render(<LeadSheet lead={l} ownerViewer={ownerViewer} onClose={vi.fn()} onChanged={onChanged} onReload={vi.fn()} />)
    );
  const options = () =>
    [...document.querySelectorAll<HTMLOptionElement>('select[aria-label="Sales stage"] option')].map((o) => o.value);
  const pick = (value: string) => {
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Sales stage"]')!;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const button = (text: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  const confirmStrip = () => document.querySelector('[role="alertdialog"]');

  beforeEach(() => {
    onChanged.mockReset();
    api.setLeadStage.mockReset().mockImplementation(async (_id: string, stage: string, outcome?: string) => ({
      ok: true,
      data: {
        success: true, id: 'L1', stage, outcome: outcome ?? null, status: outcome === 'no_sale' ? 'lost' : 'booked',
        entry: { stage, outcome, at: '2026-10-19T00:00:00.000Z', byUid: 'adm' },
        ...(outcome === 'no_sale' ? { cancelledBookingId: 'b1' } : {}),
      },
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('asks before No sale cancels the live booking; Back changes nothing', () => {
    render(lead());
    pick('appointment_demoed:no_sale');
    expect(api.setLeadStage).not.toHaveBeenCalled();
    expect(confirmStrip()?.textContent).toContain('This also cancels the consultation.');
    expect(confirmStrip()?.textContent).toContain('Jeremy');
    act(() => button('Back')!.click());
    expect(confirmStrip()).toBeNull();
    expect(api.setLeadStage).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('confirming sends no_sale and drops the booking from the sheet', async () => {
    render(lead());
    pick('appointment_demoed:no_sale');
    await act(async () => {
      button('Set No sale')!.click();
    });
    expect(api.setLeadStage).toHaveBeenCalledWith('L1', 'appointment_demoed', 'no_sale');
    expect(onChanged).toHaveBeenCalledWith('L1', expect.objectContaining({ stageOutcome: 'no_sale', booking: null }));
    expect(confirmStrip()).toBeNull();
  });

  it('saves other stages, and No sale without a booking, straight away', async () => {
    render(lead());
    await act(async () => pick('appointment_demoed:proposal_sent'));
    expect(api.setLeadStage).toHaveBeenLastCalledWith('L1', 'appointment_demoed', 'proposal_sent');
    expect(confirmStrip()).toBeNull();

    render(lead({ booking: null, status: 'new' }));
    await act(async () => pick('appointment_demoed:no_sale'));
    expect(api.setLeadStage).toHaveBeenLastCalledWith('L1', 'appointment_demoed', 'no_sale');
    expect(confirmStrip()).toBeNull();
  });

  it('a non-owner admin gets no sale choices and no Mark sold on an open lead', () => {
    render(lead());
    expect(options()).toEqual(['none', 'appointment_demoed:no_sale', 'appointment_demoed:proposal_sent']);
    expect(button('Mark sold')).toBeUndefined();
    expect(button('Mark lost')).toBeDefined();
  });

  it('an owner gets every stage and Mark sold', () => {
    render(lead(), true);
    expect(options()).toEqual([
      'none', 'appointment_demoed:sale', 'appointment_demoed:no_sale', 'appointment_demoed:proposal_sent',
      'site_survey', 'permit_approved', 'install_scheduled', 'install_complete', 'pto',
    ]);
    expect(button('Mark sold')).toBeDefined();
  });

  it('a non-owner sees a sold lead read-only: no picker, no Reopen', () => {
    render(lead({ status: 'sold', stage: 'site_survey' }));
    expect(document.querySelector('select[aria-label="Sales stage"]')).toBeNull();
    expect(document.body.textContent).toContain('Site survey');
    expect(document.body.textContent).toContain('Only an owner can change a sold deal.');
    expect(button('Reopen')).toBeUndefined();
    // The booking is not a closing action: it can still be cancelled.
    expect(button('Cancel booking')).toBeDefined();
  });

  it('an owner can still change and reopen a sold lead', () => {
    render(lead({ status: 'sold', stage: 'site_survey' }), true);
    expect(document.querySelector('select[aria-label="Sales stage"]')).not.toBeNull();
    expect(button('Reopen')).toBeDefined();
  });

  it('a non-owner can still reopen a lost lead', () => {
    render(lead({ status: 'lost', stage: 'appointment_demoed', stageOutcome: 'no_sale', booking: null }));
    expect(button('Reopen')).toBeDefined();
    expect(options()).not.toContain('appointment_demoed:sale');
  });
});
