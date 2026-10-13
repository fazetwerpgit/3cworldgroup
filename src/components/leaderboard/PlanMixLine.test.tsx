// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanMixLine } from './PlanMixLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const worst = [
  { tier: '1 Gig', count: 23 },
  { tier: '2 Gig', count: 14 },
  { tier: '500', count: 9 },
  { tier: '300', count: 6 },
];
const FULL = 'Plan mix: 23× 1 Gig · 14× 2 Gig · 9× 500 · 6× 300';

let container: HTMLDivElement;
let root: Root;

/** jsdom has no layout: give the slot a width, and each form 6px per character. */
function layout(slotWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'plan-mix' ? slotWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: (this.textContent ?? '').length * 6 } as DOMRect;
  });
}

function render() {
  act(() => root.render(<PlanMixLine mix={worst} />));
  const line = container.querySelector<HTMLElement>('[data-testid="plan-mix"]')!;
  return {
    shown: line.querySelector('[class*="mixText"]')?.textContent,
    label: line.querySelector('[class*="srOnly"]')?.textContent,
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('PlanMixLine', () => {
  it('shows the full line when it fits', () => {
    layout(400);
    expect(render()).toEqual({ shown: '23× 1 Gig · 14× 2 Gig · 9× 500 · 6× 300', label: FULL });
  });

  it('steps down to the longest compact form that fits, keeping the full line for screen readers', () => {
    layout(200); // full is 234px, compact 174px
    expect(render()).toEqual({ shown: '23×1G · 14×2G · 9×500 · 6×300', label: FULL });
  });

  it('keeps the top two tiers and +N on a narrower slot', () => {
    layout(120); // top two +N is 102px
    expect(render()).toEqual({ shown: '23×1G · 14×2G +15', label: FULL });
  });

  it('falls to the top tier and +N when nothing longer fits', () => {
    layout(40);
    expect(render()).toEqual({ shown: '23×1G +29', label: FULL });
  });

  it('keeps the full line before there is any layout to measure', () => {
    layout(0);
    expect(render()).toEqual({ shown: '23× 1 Gig · 14× 2 Gig · 9× 500 · 6× 300', label: FULL });
  });

  it('renders nothing without a mix', () => {
    act(() => root.render(<PlanMixLine mix={[]} />));
    expect(container.innerHTML).toBe('');
  });
});
