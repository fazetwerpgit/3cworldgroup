// @vitest-environment jsdom
//
// The one-time Home card for the screenshot reader: shown from the launch day
// for 14 days while the reader is on, gone once dismissed or used.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanIntroCard } from './ScanIntroCard';
import { SCAN_INTRO_KEY, markScanIntroUsed } from '@/lib/sales/scan/intro';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const day = (iso: string) => new Date(`${iso}T12:00:00`);

async function mount(now: Date) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ScanIntroCard now={now} />));
}
const card = () => container.querySelector('section');

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv('SALE_SCAN_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SALE_SCAN_LAUNCH', '2026-09-24');
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

describe('ScanIntroCard', () => {
  it('shows the card with its copy and a Try it link to Log Sale', async () => {
    await mount(day('2026-09-24'));
    expect(card()!.textContent).toContain('New: log a sale from a screenshot');
    expect(card()!.textContent).toContain('Add the order confirmation and the details fill in. Check them, then submit.');
    const link = container.querySelector<HTMLAnchorElement>('a')!;
    expect(link.textContent).toBe('Try it');
    expect(link.getAttribute('href')).toBe('/portal/sales/new');
  });

  it('hides for good once dismissed', async () => {
    await mount(day('2026-09-25'));
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!;
    await act(async () => close.click());
    expect(card()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SCAN_INTRO_KEY)!)).toMatchObject({ dismissed: true });
    await act(async () => root.unmount());
    container.remove();
    await mount(day('2026-09-25'));
    expect(card()).toBeNull();
  });

  it('hides once the rep has had a screenshot read', async () => {
    await mount(day('2026-09-25'));
    expect(card()).not.toBeNull();
    await act(async () => markScanIntroUsed());
    expect(card()).toBeNull();
  });

  it('shows for 14 days from the launch day, not before or after', async () => {
    await mount(day('2026-10-07'));
    expect(card()).not.toBeNull();
    await act(async () => root.render(<ScanIntroCard now={day('2026-10-08')} />));
    expect(card()).toBeNull();
    await act(async () => root.render(<ScanIntroCard now={day('2026-09-23')} />));
    expect(card()).toBeNull();
  });

  it('never shows with the reader off or no launch date', async () => {
    vi.stubEnv('SALE_SCAN_ENABLED', 'false');
    await mount(day('2026-09-25'));
    expect(card()).toBeNull();
    vi.stubEnv('SALE_SCAN_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_SALE_SCAN_LAUNCH', '');
    await act(async () => root.render(<ScanIntroCard now={day('2026-09-25')} />));
    expect(card()).toBeNull();
  });

  it('shows even when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await mount(day('2026-09-25'));
    expect(card()).not.toBeNull();
    vi.restoreAllMocks();
  });
});
