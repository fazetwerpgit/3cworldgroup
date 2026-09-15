// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatCountdown,
  PeriodCountdown,
  periodBounds,
  periodLabel,
} from './PeriodCountdown';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('Chicago period boundaries', () => {
  it('ends a week at the following Sunday midnight', () => {
    const now = new Date('2026-09-10T17:00:00.000Z');
    const bounds = periodBounds('week', now);

    expect(bounds?.start.toISOString()).toBe('2026-09-06T05:00:00.000Z');
    expect(bounds?.end.toISOString()).toBe('2026-09-13T05:00:00.000Z');
    expect(formatCountdown('week', now)).toBe('2d 12h left');
  });

  it('ends a month at Chicago midnight on its first day', () => {
    const now = new Date('2026-09-10T17:00:00.000Z');
    const bounds = periodBounds('month', now);

    expect(bounds?.start.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(bounds?.end.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(formatCountdown('month', now)).toBe('20d 12h left');
  });

  it('uses the shorter real-time week when daylight saving time begins', () => {
    const now = new Date('2026-03-08T06:00:00.000Z');
    const bounds = periodBounds('week', now);

    expect(bounds?.start.toISOString()).toBe('2026-03-08T06:00:00.000Z');
    expect(bounds?.end.toISOString()).toBe('2026-03-15T05:00:00.000Z');
    expect(formatCountdown('week', now)).toBe('6d 23h left');
  });

  it('uses the longer real-time week when daylight saving time ends', () => {
    const now = new Date('2026-11-01T05:00:00.000Z');
    const bounds = periodBounds('week', now);

    expect(bounds?.start.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(bounds?.end.toISOString()).toBe('2026-11-08T06:00:00.000Z');
    expect(formatCountdown('week', now)).toBe('7d 1h left');
  });

  it('hides every all-time countdown and labels the selected metric', () => {
    expect(periodBounds('all')).toBeNull();
    expect(formatCountdown('all')).toBeNull();
    expect(periodLabel('week', 'totalSales')).toBe('Weekly sales · resets Sunday');
    expect(periodLabel('month')).toBe('Monthly points · resets on the 1st');
    expect(periodLabel('year', 'totalSales')).toBe('Yearly sales · resets Jan 1');
    expect(periodBounds('year', new Date('2026-09-10T17:00:00.000Z'))?.start.toISOString())
      .toBe('2026-01-01T06:00:00.000Z');
  });
});

describe('PeriodCountdown', () => {
  it('refreshes its displayed value every minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T04:59:00.000Z'));

    act(() => root.render(<PeriodCountdown period="week" />));
    expect(container.textContent).toBe('Under 1h left');

    act(() => {
      vi.setSystemTime(new Date('2026-09-20T05:01:00.000Z'));
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toBe('6d 23h left');
  });

  it('renders a month countdown with the explicit DOM space before left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T18:00:00.000Z'));

    act(() => root.render(<PeriodCountdown period="month" />));

    expect(container.textContent).toBe('16d 11h left');
  });

  it('renders nothing for all time', () => {
    act(() => root.render(<PeriodCountdown period="all" />));
    expect(container.innerHTML).toBe('');
  });
});
