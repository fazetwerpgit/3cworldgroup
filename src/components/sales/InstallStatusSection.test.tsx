// @vitest-environment jsdom
//
// Install status now carries a second feed: what each rep logged in the portal,
// under the carrier's account of that same rep. The rule that matters is WHOSE
// submissions are legible — an owner reads every rep's, an admin reads only
// their own — because the raw feed is evidence about other people's work.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiberOrder, FiberStatusResponse, Sale } from '@/types';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'test-token' }));
vi.mock('@/hooks/useFiberStatus', () => ({ useFiberStatus: () => ({ data: null, loading: false, error: null, refetch: async () => {} }) }));

import { InstallStatusSection } from './InstallStatusSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const order = (over: Partial<FiberOrder>): FiberOrder => ({
  id: 'TMO1',
  status: 'active',
  rawStatus: 'Active',
  repDealerId: '4721016',
  repName: 'Noah St John',
  matchedUserId: 'u1',
  orderDate: '2026-08-01',
  estInstallDate: null,
  activationDate: null,
  cancellationDate: null,
  deactivationDate: null,
  fiberPlan: null,
  mrc: 70,
  address: '58030 JEWELL RD',
  unit: null,
  city: null,
  state: null,
  zip: null,
  breakageReason: null,
  breakageNotes: null,
  customerName: null,
  sourceSheet: 'orders',
  reportReceivedAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
  ...over,
});

const sale = (over: Partial<Sale>): Sale => ({
  id: 's1',
  salesRepId: 'u1',
  salesRepName: 'Noah St John',
  customerAddress: '58030 Jewwel Rd.',
  customerName: 'A Customer',
  saleType: 'new_service',
  products: [],
  totalValue: 60,
  totalPoints: 8,
  status: 'approved',
  saleDate: new Date('2026-08-10T12:00:00'),
  ...over,
} as unknown as Sale);

function fiber(orders: FiberOrder[]) {
  const data: FiberStatusResponse = { scope: 'all', lastReportAt: '2026-09-01', orders, unmatched: [] };
  return { data, loading: false, error: null, refetch: async () => {} };
}

async function render(props: Parameters<typeof InstallStatusSection>[0]) {
  await act(async () => { root.render(<InstallStatusSection {...props} />); });
}

function openEveryGroup() {
  const heads = [...container.querySelectorAll<HTMLButtonElement>('.sales-line-fiber-group-head')];
  return act(async () => { heads.forEach((head) => head.click()); });
}

function submittedAddresses() {
  return [...container.querySelectorAll('.sales-board-sub-addr')].map((node) => node.textContent);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('what a rep logged, under the carrier rows', () => {
  const noahSale = sale({ id: 's1', salesRepId: 'u1' });
  const willSale = sale({ id: 's2', salesRepId: 'u2', salesRepName: 'Will Teasdale', customerAddress: '12150 Parkside Cir' });
  const orders = [order({}), order({ id: 'TMO2', repName: 'Will Teasdale', matchedUserId: 'u2', address: '12181 PARKSIDE CIR' })];

  it('an owner reads every rep', async () => {
    await render({ fiber: fiber(orders), sales: [noahSale, willSale], ownerView: true, viewerId: 'owner1' });
    await openEveryGroup();
    // Groups sit in rep-name order: Noah before Will.
    expect(submittedAddresses()).toEqual(['58030 Jewwel Rd.', '12150 Parkside Cir']);
  });

  it('an admin reads only their own', async () => {
    await render({ fiber: fiber(orders), sales: [noahSale, willSale], ownerView: false, viewerId: 'u2' });
    await openEveryGroup();
    expect(submittedAddresses()).toEqual(['12150 Parkside Cir']);
  });

  // The count belongs on the collapsed head: "12 orders · 9 logged" is the
  // whole comparison, before anything is expanded.
  it('says how many were logged on the closed group head', async () => {
    await render({ fiber: fiber([order({})]), sales: [noahSale], ownerView: true, viewerId: 'owner1' });
    expect(container.querySelector('.sales-line-fiber-group-count')?.textContent).toBe('1 orders · 1 logged');
  });

  it('a rep the carrier never reported still gets a group, so their sales are not invisible', async () => {
    const ghost = sale({ id: 's3', salesRepId: 'u3', salesRepName: 'Aaron Ghost', customerAddress: '9 Nowhere St' });
    await render({ fiber: fiber([order({})]), sales: [noahSale, ghost], ownerView: true, viewerId: 'owner1' });
    const heads = [...container.querySelectorAll('.sales-line-fiber-group-head')].map((n) => n.textContent);
    expect(heads.some((text) => text?.includes('Aaron Ghost') && text?.includes('0 orders'))).toBe(true);
  });

  it('searching an address finds it on either side, with the group already open', async () => {
    await render({ fiber: fiber(orders), sales: [noahSale, willSale], ownerView: true, viewerId: 'owner1' });
    const search = container.querySelector<HTMLInputElement>('.sales-line-fiber-search input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(search, 'jewwel');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // One group survives, expanded, and only the matching submission is in it.
    expect(container.querySelectorAll('.sales-line-fiber-group')).toHaveLength(1);
    expect(submittedAddresses()).toEqual(['58030 Jewwel Rd.']);
  });
});
