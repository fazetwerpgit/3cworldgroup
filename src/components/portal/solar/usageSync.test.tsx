// @vitest-environment jsdom
//
// The usage slide sends monthlyKwh + usage to the saved lead: after a pause in
// typing, and when the slide closes with a change unsent. Failures stay quiet
// and never block.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ updateLeadExtras: vi.fn() }));
vi.mock('./solarClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./solarClient')>()),
  updateLeadExtras: api.updateLeadExtras,
}));

import { DeckProvider, useDeck, type DeckState } from './deckState';
import { UsageSlide } from './UsageSlide';
import { EMPTY_USAGE } from './usage';
import { USAGE_SAVE_DELAY_MS, usageNeedsSave, usagePatch, usageSaveKey } from './usageSync';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const empty = () => ({ ...EMPTY_USAGE, months: [...EMPTY_USAGE.months] });

describe('usagePatch / usageNeedsSave', () => {
  it('sends the entry, and monthlyKwh only once there is an estimate', () => {
    expect(usagePatch(empty())).toEqual({
      usage: { mode: 'monthly', monthly: null, daily: null, months: Array(12).fill(null) },
      monthlyKwh: null,
    });
    expect(usagePatch({ ...empty(), mode: 'daily', daily: 30 })).toMatchObject({ monthlyKwh: 913, usage: { mode: 'daily', daily: 30 } });
  });

  it('needs a lead, a change, and something to say', () => {
    const filled = { ...empty(), monthly: 900 };
    expect(usageNeedsSave(null, filled, null)).toBe(false);
    expect(usageNeedsSave('L1', empty(), null)).toBe(false);
    expect(usageNeedsSave('L1', filled, null)).toBe(true);
    expect(usageNeedsSave('L1', filled, usageSaveKey('L1', filled))).toBe(false);
    // Clearing what was saved to this lead is a change worth sending; another lead's key isn't.
    expect(usageNeedsSave('L1', empty(), usageSaveKey('L1', filled))).toBe(true);
    expect(usageNeedsSave('L2', empty(), usageSaveKey('L1', filled))).toBe(false);
  });
});

describe('UsageSlide saves to the lead', () => {
  let container: HTMLDivElement;
  let root: Root;
  let deck: { state: DeckState; update: (patch: Partial<DeckState>) => void };

  function Harness({ show, onDeck }: { show: boolean; onDeck: (value: typeof deck) => void }) {
    const value = useDeck();
    useEffect(() => {
      onDeck(value);
    });
    return show ? <UsageSlide /> : <p>next slide</p>;
  }
  const render = (show: boolean) =>
    act(() =>
      root.render(
        <DeckProvider>
          <Harness show={show} onDeck={(value) => {
            deck = value;
          }} />
        </DeckProvider>
      )
    );
  const type = (value: string) => {
    const input = container.querySelector<HTMLInputElement>('#solar-kwh-monthly')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const note = () => container.querySelector('[data-testid="solar-usage-save"]');

  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    api.updateLeadExtras.mockReset().mockResolvedValue({ ok: true, data: { success: true } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('does nothing before the lead exists', async () => {
    render(true);
    type('900');
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS * 2));
    expect(api.updateLeadExtras).not.toHaveBeenCalled();
    expect(note()).toBeNull();
  });

  it('saves once after a pause in typing, then says so', async () => {
    render(true);
    act(() => deck.update({ leadId: 'L1' }));
    type('9');
    type('90');
    type('900');
    expect(api.updateLeadExtras).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS));
    expect(api.updateLeadExtras).toHaveBeenCalledTimes(1);
    expect(api.updateLeadExtras).toHaveBeenCalledWith('L1', expect.objectContaining({ monthlyKwh: 900 }));
    expect(note()?.textContent).toBe('Saved to the lead.');
    expect(deck.state.usageSaved).toBe(usageSaveKey('L1', deck.state.usage));
    // Nothing new: no second save.
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS * 2));
    expect(api.updateLeadExtras).toHaveBeenCalledTimes(1);
  });

  it('sends an unsent change when the slide closes (Next)', async () => {
    render(true);
    act(() => deck.update({ leadId: 'L1' }));
    type('1250');
    await act(async () => render(false));
    expect(api.updateLeadExtras).toHaveBeenCalledWith('L1', expect.objectContaining({ monthlyKwh: 1250 }));
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS * 2));
    expect(api.updateLeadExtras).toHaveBeenCalledTimes(1);
    expect(deck.state.usageSaved).toBe(usageSaveKey('L1', deck.state.usage));
  });

  it('clearing the usage after a save sends monthlyKwh null', async () => {
    render(true);
    act(() => deck.update({ leadId: 'L1' }));
    type('900');
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS));
    type('');
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS));
    expect(api.updateLeadExtras).toHaveBeenCalledTimes(2);
    expect(api.updateLeadExtras).toHaveBeenLastCalledWith('L1', expect.objectContaining({ monthlyKwh: null }));
  });

  it('a failed save shows a quiet note, keeps the input, and retries on the next change', async () => {
    api.updateLeadExtras.mockResolvedValueOnce({ ok: false, status: 0, error: 'No connection. Try again.' });
    render(true);
    act(() => deck.update({ leadId: 'L1' }));
    type('900');
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS));
    expect(note()?.getAttribute('data-state')).toBe('failed');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(deck.state.usageSaved).toBeNull();
    expect(container.querySelector<HTMLInputElement>('#solar-kwh-monthly')!.disabled).toBe(false);
    type('950');
    await act(async () => vi.advanceTimersByTime(USAGE_SAVE_DELAY_MS));
    expect(api.updateLeadExtras).toHaveBeenLastCalledWith('L1', expect.objectContaining({ monthlyKwh: 950 }));
    expect(note()?.textContent).toBe('Saved to the lead.');
  });
});
