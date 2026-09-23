// @vitest-environment jsdom
//
// Covers the rep-facing install-date edit in the detail sheet. A customer
// reschedules and the rep has to move the date from their phone; the API has
// always allowed a rep to edit their own sale, so the only thing under test is
// who the sheet offers the control to and what it sends: the owning rep goes
// through the install-date-only route, an admin on someone else's sale through
// the full edit.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from '@/types';

const viewer = vi.hoisted(() => ({ uid: 'rep1' }));
const api = vi.hoisted(() => ({ updateSale: vi.fn(async () => true) }));
type SaveResult = { ok: true; installDate: string } | { ok: false; error: string };
const own = vi.hoisted(() => ({
  save: vi.fn<(saleId: string, day: string) => Promise<SaveResult>>(async () => ({
    ok: true,
    installDate: '2026-10-02T17:00:00.000Z',
  })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: viewer.uid, displayName: 'Wil Teasdale' }, isRole: () => false }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ updateSale: api.updateSale, loading: false, error: null }),
}));
vi.mock('@/lib/firebase/config', () => ({ auth: null }));
vi.mock('@/lib/sales/saveInstallDate', () => ({
  saveInstallDate: (...args: [string, string]) => own.save(...args),
}));
vi.mock('@/components/chat/ChatLightbox', () => ({ ChatLightbox: () => null }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { SaleDetailSheet } from './SaleDetailSheet';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const SALE: Sale = {
  id: 'sale1',
  salesRepId: 'rep1',
  salesRepName: 'Wil Teasdale',
  customerName: 'Dana Whitfield',
  customerAddress: '4120 Wentworth Avenue',
  saleType: 'new_service',
  products: [],
  totalValue: 90,
  totalPoints: 2,
  status: 'pending',
  saleDate: new Date(2026, 8, 1, 12, 0, 0),
  installDate: new Date(2026, 8, 20, 12, 0, 0),
  createdAt: new Date(2026, 8, 1, 12, 0, 0),
  updatedAt: new Date(2026, 8, 1, 12, 0, 0),
};

function render(sale: Sale, isAdmin = false) {
  act(() => {
    root.render(
      <SaleDetailSheet
        sale={sale}
        index={0}
        total={1}
        open
        onOpenChange={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        isAdmin={isAdmin}
        onRequestDelete={() => {}}
      />
    );
  });
}

/** The sheet portals to <body>, so every query runs against the document. */
function buttonByText(label: string) {
  return Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label
  );
}

function installInput() {
  return document.body.querySelector<HTMLInputElement>('#sale-install-date');
}

function click(element: Element | undefined) {
  if (!element) throw new Error('element not found');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  viewer.uid = 'rep1';
  api.updateSale = vi.fn(async () => true);
  own.save.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('SaleDetailSheet install date', () => {
  it('lets the owning rep save a new install date', async () => {
    render(SALE);
    click(buttonByText('Change'));

    const input = installInput();
    expect(input).toBeTruthy();
    // Prefilled with the date already on the sale.
    expect(input!.value).toBe('2026-09-20');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!;
      setter.call(input!, '2026-10-02');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      buttonByText('Save')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(own.save).toHaveBeenCalledWith('sale1', '2026-10-02');
    expect(api.updateSale).not.toHaveBeenCalled();
    // The sheet shows the saved date without waiting for the list to refetch.
    expect(document.body.textContent).toContain('Oct 2');
    expect(installInput()).toBeNull();
  });

  it('offers no control to a rep who does not own the sale', () => {
    viewer.uid = 'rep2';
    render(SALE);
    expect(buttonByText('Change')).toBeUndefined();
  });

  it('offers no control on a cancelled or rejected sale', () => {
    render({ ...SALE, status: 'cancelled' });
    expect(buttonByText('Change')).toBeUndefined();
    render({ ...SALE, status: 'rejected' });
    expect(buttonByText('Change')).toBeUndefined();
  });

  it("shows the route's reason when the rep's save fails, and keeps the editor open", async () => {
    own.save.mockResolvedValueOnce({ ok: false, error: 'No signal. Tap Save to try again.' });
    render(SALE);
    click(buttonByText('Change'));

    await act(async () => {
      buttonByText('Save')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('No signal. Tap Save to try again.');
    // The editor stays open so the rep can retry.
    expect(installInput()).toBeTruthy();
  });

  it("keeps an admin on someone else's sale on the full edit", async () => {
    viewer.uid = 'admin1';
    api.updateSale = vi.fn(async () => false);
    render(SALE, true);
    click(buttonByText('Change'));

    await act(async () => {
      buttonByText('Save')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(api.updateSale).toHaveBeenCalledWith('sale1', { installDate: '2026-09-20' });
    expect(own.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Could not save the install date. Try again.');
  });
});

describe('SaleDetailSheet proof screenshots', () => {
  const A = 'form-attachments/rep1/sale-proof/slot_aaaaaa/';
  const B = 'form-attachments/rep1/sale-proof/slot_bbbbbb/';

  function proofButtons() {
    return Array.from(document.body.querySelectorAll('[data-part="proof"] button')).map(
      (button) => button.textContent?.trim()
    );
  }

  it('renders one control per screenshot', () => {
    render({ ...SALE, proofScreenshotPaths: [A, B], proofScreenshotPath: A });
    expect(proofButtons()).toEqual(['Screenshot 1', 'Screenshot 2']);
  });

  it('renders a single control for a legacy single-path sale', () => {
    render({ ...SALE, proofScreenshotPath: A });
    expect(proofButtons()).toEqual(['View proof screenshot']);
  });

  it('renders no control and the empty copy when there is no proof', () => {
    render(SALE);
    expect(proofButtons()).toEqual([]);
    expect(document.body.textContent).toContain('No order number or proof attached');
  });
});
