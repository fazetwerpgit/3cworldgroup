// @vitest-environment jsdom
//
// Slide 4's bill field: a rep types the homeowner's exact bill (cents and
// amounts past the slider's top included); the slider parks at its end.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanBillDraft, editableBill, formatBill, parseBill, sliderPosition } from './billInput';

const deck = vi.hoisted(() => ({ state: { monthlyBill: 150, apy: 0.05, years: 25 }, update: vi.fn() }));
vi.mock('./deckState', () => ({
  useDeck: () => ({
    state: deck.state,
    update: (patch: Partial<typeof deck.state>) => {
      deck.update(patch);
      Object.assign(deck.state, patch);
    },
  }),
}));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

import { CalculatorSlide } from './CalculatorSlide';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('bill helpers', () => {
  it('parses cents, commas and the $ sign', () => {
    expect(parseBill('212.50')).toBe(212.5);
    expect(parseBill('1,000')).toBe(1000);
    expect(parseBill('$1,234.56')).toBe(1234.56);
    expect(parseBill('')).toBe(0);
    expect(parseBill('.')).toBe(0);
  });

  it('keeps a half-typed amount and drops a third decimal', () => {
    expect(cleanBillDraft('212.')).toBe('212.');
    expect(cleanBillDraft('212.505')).toBe('212.50');
    expect(cleanBillDraft('1.2.3')).toBe('1.23');
    expect(cleanBillDraft('0045')).toBe('45');
    expect(cleanBillDraft('.5')).toBe('0.5');
  });

  it('caps a typo at the field max, not the slider max', () => {
    expect(parseBill('950')).toBe(950);
    expect(parseBill('9999999')).toBe(25_000);
  });

  it('formats for reading and for editing', () => {
    expect(formatBill(212.5)).toBe('212.50');
    expect(formatBill(1000)).toBe('1,000');
    expect(formatBill(0)).toBe('0');
    expect(editableBill(212.5)).toBe('212.50');
    expect(editableBill(1000)).toBe('1000');
  });

  it('parks the slider at its ends', () => {
    expect(sliderPosition(1000)).toBe(600);
    expect(sliderPosition(20)).toBe(50);
    expect(sliderPosition(212.5)).toBe(212.5);
  });
});

describe('CalculatorSlide bill field', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(deck.state, { monthlyBill: 150, apy: 0.05, years: 25 });
    deck.update.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<CalculatorSlide />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const field = () => container.querySelector<HTMLInputElement>('#solar-bill')!;
  const slider = () => container.querySelector<HTMLInputElement>('input[type="range"]')!;

  function type(value: string) {
    const input = field();
    act(() => input.focus());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('is a decimal text field that opens the number pad', () => {
    expect(field().type).toBe('text');
    expect(field().inputMode).toBe('decimal');
  });

  it('keeps cents: 212.50 stays 212.50', () => {
    type('212.50');
    expect(deck.update).toHaveBeenLastCalledWith({ monthlyBill: 212.5 });
    act(() => field().blur());
    expect(field().value).toBe('212.50');
  });

  it('takes 1,000 past the slider top and parks the slider at 600', () => {
    type('1,000');
    expect(deck.update).toHaveBeenLastCalledWith({ monthlyBill: 1000 });
    act(() => field().blur());
    expect(field().value).toBe('1,000');
    expect(slider().value).toBe('600');
  });

  it('shows plain digits while editing', () => {
    Object.assign(deck.state, { monthlyBill: 1000 });
    act(() => root.render(<CalculatorSlide />));
    act(() => field().focus());
    expect(field().value).toBe('1000');
  });
});
