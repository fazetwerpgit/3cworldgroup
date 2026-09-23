// @vitest-environment jsdom
//
// The rep's install-date sheet: it saves through the narrow install-date
// route, a missed install needs a later day, and a failed save keeps the sheet
// open with the reason and a Save that retries.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveMock = vi.fn();
vi.mock('@/lib/sales/saveInstallDate', () => ({
  saveInstallDate: (...args: unknown[]) => saveMock(...args),
}));
vi.mock('./BodyLayer', () => ({
  BodyLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useIsClient: () => true,
}));

import { InstallDateSheet } from './InstallDateSheet';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onSaved = vi.fn();

function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function noon(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

function render(props: { missed: boolean; installDate?: Date; missedDay?: unknown }) {
  act(() => {
    root.render(
      <InstallDateSheet
        sale={{ id: 's1', customerName: 'Priya Nair', saleDate: noon(-10), installDate: props.installDate }}
        plan="TFiber 2 Gig"
        missed={props.missed}
        missedDay={props.missedDay}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  });
}

const input = () => container.querySelector<HTMLInputElement>('#install-date-input')!;
const save = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? null;

function pick(day: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(), day);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    save().click();
  });
}

beforeEach(() => {
  saveMock.mockReset();
  onClose.mockReset();
  onSaved.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('InstallDateSheet', () => {
  it('prefills the current day for a change and saves the new one', async () => {
    saveMock.mockResolvedValue({ ok: true, installDate: noon(4).toISOString() });
    render({ missed: false, installDate: noon(2) });

    expect(container.textContent).toContain('Change install date');
    expect(container.textContent).toContain("We'll update this automatically when the carrier's report changes it.");
    expect(input().value).toBe(dayFromToday(2));
    expect(input().min).toBe(dayFromToday(-10));
    pick(dayFromToday(4));
    await submit();

    expect(saveMock).toHaveBeenCalledWith('s1', dayFromToday(4));
    expect(onSaved).toHaveBeenCalledWith('s1', noon(4).toISOString());
    expect(onClose).toHaveBeenCalled();
  });

  it('starts a missed install empty and wants a day after the missed one', async () => {
    render({ missed: true, installDate: noon(-2) });

    expect(container.textContent).toContain('Reschedule the install');
    expect(container.textContent).toContain('marked the last install as missed');
    expect(input().value).toBe('');
    await submit();
    expect(alertText()).toBe('Pick the install day.');

    pick(dayFromToday(-2));
    await submit();
    expect(alertText()).toBe('Pick a day after the missed one.');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("measures a missed install against the carrier's missed day, not the sale's", async () => {
    // The sale still says two days ago, but the carrier's miss was yesterday:
    // yesterday would still count as missed, so it has to be today or later.
    render({ missed: true, installDate: noon(-2), missedDay: dayFromToday(-1) });
    expect(input().min).toBe(dayFromToday(0));

    pick(dayFromToday(-1));
    await submit();
    expect(alertText()).toBe('Pick a day after the missed one.');
    expect(saveMock).not.toHaveBeenCalled();

    saveMock.mockResolvedValue({ ok: true, installDate: noon(0).toISOString() });
    pick(dayFromToday(0));
    await submit();
    expect(saveMock).toHaveBeenCalledWith('s1', dayFromToday(0));
  });

  it("reads the carrier's missed day however it was stored", async () => {
    // The sale says two days ago; the carrier's miss was yesterday, stored as
    // a Timestamp, an ISO time or M/D/YYYY. None of them may fall back to the sale.
    const missed = noon(-1);
    const [y, m, d] = dayFromToday(-1).split('-').map(Number);
    for (const missedDay of [{ toDate: () => missed }, missed.toISOString(), `${m}/${d}/${y}`]) {
      render({ missed: true, installDate: noon(-2), missedDay });
      expect(input().min).toBe(dayFromToday(0));
      pick(dayFromToday(-1));
      await submit();
      expect(alertText()).toBe('Pick a day after the missed one.');
      act(() => root.render(<></>));
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('keeps Close disabled while a save is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    saveMock.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render({ missed: false, installDate: noon(2) });
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;

    pick(dayFromToday(5));
    act(() => {
      save().click();
    });
    expect(close.disabled).toBe(true);
    close.click();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish({ ok: false, error: "Couldn't save the date. Tap Save to try again." }));
    expect(close.disabled).toBe(false);
  });

  it('refuses a day before the sale without a round trip', async () => {
    render({ missed: false });

    expect(container.textContent).toContain('Add install date');
    pick(dayFromToday(-11));
    await submit();

    expect(alertText()).toBe('Install date is before the sale date.');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('keeps the sheet open on a failed save, then Save retries', async () => {
    saveMock.mockResolvedValueOnce({ ok: false, error: 'No signal. Tap Save to try again.' });
    saveMock.mockResolvedValueOnce({ ok: true, installDate: noon(3).toISOString() });
    render({ missed: false });

    pick(dayFromToday(3));
    await submit();
    expect(alertText()).toBe('No signal. Tap Save to try again.');
    expect(onClose).not.toHaveBeenCalled();
    expect(save().disabled).toBe(false);

    await submit();
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
