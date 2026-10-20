// @vitest-environment jsdom
//
// The prequal slide (Jeremy's slide 73): 680+ and 600–679 programs, and Under
// 600, which closes the lead as no sale (low credit) and shows a polite end
// state with New customer and Change answer.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  markLowCredit: vi.fn(async () => ({ ok: true as const, data: { success: true, status: 'lost' } })),
  setCreditTier: vi.fn(async () => ({ ok: true as const, data: { success: true } })),
}));
vi.mock('./solarClient', async (orig) => ({ ...(await orig<typeof import('./solarClient')>()), ...api }));

import { DeckProvider, hasLeadInProgress, useDeck, type DeckState } from './deckState';
import { PrequalSlide, TIERS } from './InteractiveSlides';
import { CREDIT_LABEL } from './leadDisplay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
// The deck state as last rendered, read after each act().
let seen: DeckState;

function Spy() {
  const { state } = useDeck();
  useEffect(() => {
    seen = state;
  });
  return null;
}

async function mount(saved: Partial<DeckState>, props = { onDone: vi.fn(), onNeedLead: vi.fn(), onNewCustomer: vi.fn() }) {
  window.sessionStorage.setItem('3c-solar-deck', JSON.stringify({ leadId: 'rep1_c1', ...saved }));
  await act(async () => {
    root.render(
      <DeckProvider>
        <PrequalSlide {...props} />
        <Spy />
      </DeckProvider>
    );
  });
  return props;
}

const button = (name: RegExp) => {
  const found = [...host.querySelectorAll('button')].find((b) => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
const click = (name: RegExp) => act(async () => button(name).click());

beforeEach(() => {
  window.sessionStorage.clear();
  api.markLowCredit.mockClear();
  api.setCreditTier.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('prequal tiers', () => {
  it('maps the cards high to low onto the unchanged wire values', () => {
    expect(TIERS.map((t) => [t.score, t.name, t.tier])).toEqual([
      ['680+', 'Lease, PPA or Purchase', 'lease_ppa_680'],
      ['600–679', 'Purchase', 'purchase_600'],
    ]);
    expect(TIERS[0].points).toContain('$0 Upfront Installation Cost');
    expect(TIERS[0].points.some((p) => /purchase/i.test(p))).toBe(true);
    expect(TIERS[1].points).toContain('Financing Through Credit Human');
    expect(CREDIT_LABEL).toEqual({ purchase_600: 'Purchase, 600–679', lease_ppa_680: 'Lease, PPA or Purchase, 680+' });
  });

  it('shows three choices, Under 600 last', async () => {
    await mount({});
    const pressable = [...host.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent);
    expect(pressable).toHaveLength(3);
    expect(pressable[0]).toContain('680+');
    expect(pressable[1]).toContain('600–679');
    expect(pressable[2]).toContain('Under 600');
    expect(pressable[2]).toContain('Not qualified right now');
  });

  it('Under 600 saves no tier, marks the lead and shows the end state', async () => {
    const props = await mount({ creditTier: 'purchase_600' });
    await click(/Under 600/);
    expect(api.markLowCredit).toHaveBeenCalledWith('rep1_c1');
    expect(api.setCreditTier).not.toHaveBeenCalled();
    expect(seen).toMatchObject({ lowCredit: true, creditTier: null });
    expect(host.textContent).toContain('Not a fit right now');
    expect(props.onDone).not.toHaveBeenCalled();
    await click(/New customer/);
    expect(props.onNewCustomer).toHaveBeenCalled();
    // Finished with this homeowner: New customer doesn't ask first.
    expect(hasLeadInProgress(seen)).toBe(false);
  });

  it('Change answer, then a tier, reopens the lead and moves on', async () => {
    const props = await mount({ lowCredit: true });
    expect(host.textContent).toContain('Not a fit right now');
    await click(/Change answer/);
    expect(button(/Under 600/).getAttribute('aria-pressed')).toBe('true');
    await click(/600–679/);
    expect(api.setCreditTier).toHaveBeenCalledWith('rep1_c1', 'purchase_600');
    expect(seen).toMatchObject({ lowCredit: false, creditTier: 'purchase_600' });
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it('Change answer, then Under 600 again, goes back to the end state without a call', async () => {
    await mount({ lowCredit: true });
    await click(/Change answer/);
    await click(/Under 600/);
    expect(api.markLowCredit).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Not a fit right now');
  });

  it('asks before cancelling a booked consultation', async () => {
    await mount({
      creditTier: 'purchase_600',
      booking: { id: 'b1', start: '2026-10-26T15:00:00.000Z', mode: 'virtual', consultantName: 'Jacob', tz: 'America/Chicago' },
    });
    await click(/Under 600/);
    expect(api.markLowCredit).not.toHaveBeenCalled();
    expect(host.textContent).toContain('This also cancels the consultation');
    await click(/Keep booking/);
    expect(seen.booking).not.toBeNull();
    await click(/Under 600/);
    await click(/^Cancel it$/);
    expect(api.markLowCredit).toHaveBeenCalledTimes(1);
    expect(seen).toMatchObject({ lowCredit: true, booking: null });
  });

  it('shows the error and stays put when the save fails', async () => {
    api.markLowCredit.mockResolvedValueOnce({ ok: false, status: 409, error: 'This lead is already closed.' } as never);
    await mount({});
    await click(/Under 600/);
    expect(seen.lowCredit).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('This lead is already closed.');
  });
});
