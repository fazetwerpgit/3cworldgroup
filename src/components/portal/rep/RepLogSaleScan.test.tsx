// @vitest-environment jsdom
//
// Log Sale screenshot reader: once a proof upload lands on a blank form the
// screenshot is read and the empty fields prefilled. The rep's typing always
// wins, unsure fields say "Check this" until touched, a failed read falls back
// quietly, the same screenshot is never read twice, and Skip cancels.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleScanResponse } from '@/lib/sales/scan/types';

const createSale = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com', status: 'active' } }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ createSale, loading: false, error: null }),
  NO_SIGNAL_SALE_MESSAGE: 'No signal',
}));
vi.mock('@/hooks/useCompPlan', () => ({
  useCompPlan: () => ({ rates: { tfiber: { 'tfiber-1gig': 130 } }, hasPlan: true, loading: false }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'tok' }));

// The upload queue, reduced to "this upload just finished" (its onAdd).
let finishUpload: (path: string) => void = () => {};
vi.mock('./ProofCapture', () => ({
  PROOF_ACCEPT: 'image/*,application/pdf',
  ProofCapture: () => null,
  useProofUploads: ({ paths, onAdd }: { paths: string[]; onAdd: (path: string) => void }) => {
    finishUpload = onAdd;
    return {
      tiles: paths.map((path) => ({ kind: 'done', key: path, path, preview: null })),
      addFiles: () => 0,
      retry: () => {},
      discard: () => {},
      remove: () => {},
      room: 4 - paths.length,
      overCap: false,
      uploadingCount: 0,
    };
  },
}));

import { RepLogSale } from './RepLogSale';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const P1 = 'form-attachments/r1/sale-proof/a_000001/';
const P2 = 'form-attachments/r1/sale-proof/a_000002/';

const READ: SaleScanResponse = {
  fields: {
    orderNumberOrBtn: { value: 'TMF-4471-90318', confidence: 'high' },
    customerName: { value: 'Marisol Keene', confidence: 'high' },
    customerPhone: { value: '(512) 555-0187', confidence: 'medium' },
    customerAddress: { value: '2217 Juniper Hollow Dr, Round Rock, TX 78664', confidence: 'high' },
    installDate: { value: '2099-10-06', confidence: 'low' },
    provider: { value: 'tfiber', confidence: 'high' },
    plan: { value: 'tfiber-1gig', confidence: 'high' },
  },
};

let container: HTMLDivElement;
let root: Root;
let scanReplies: Array<SaleScanResponse | Error | { status: number } | Promise<SaleScanResponse>>;
let scanBodies: Array<{ paths: string[] }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RepLogSale />));
  const manual = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Enter manually')
  )!;
  await act(async () => manual.click());
}

const field = <T extends HTMLElement = HTMLInputElement>(id: string) => container.querySelector<T>(`#${id}`)!;
const text = () => container.textContent ?? '';
const checkTags = () => Array.from(container.querySelectorAll('label')).filter((l) => l.textContent?.includes('Check this'));

async function type(id: string, value: string) {
  const el = field(id);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function upload(path: string) {
  await act(async () => finishUpload(path));
  // Let the token, fetch and JSON promises settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  scanReplies = [];
  scanBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('/api/portal/sales/scan')) return json({ url: null });
      scanBodies.push(JSON.parse(String(init?.body)));
      const reply = scanReplies.shift() ?? { fields: null, reason: 'unexpected' };
      if (reply instanceof Error) throw reply;
      if ('status' in reply) return json({ error: 'x' }, reply.status);
      return json(await reply);
    })
  );
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query }) as MediaQueryList);
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('RepLogSale screenshot reader', () => {
  it('prefills only the fields the rep has not typed in', async () => {
    await mount();
    await type('customerName', 'Marisol K');
    scanReplies.push(READ);
    await upload(P1);

    expect(scanBodies).toEqual([{ paths: [P1] }]);
    expect(field('customerName').value).toBe('Marisol K');
    expect(field('orderNumberOrBtn').value).toBe('TMF-4471-90318');
    expect(field('customerAddress').value).toBe('2217 Juniper Hollow Dr, Round Rock, TX 78664');
    expect(field('installDate').value).toBe('2099-10-06');
    expect(field<HTMLSelectElement>('plan').value).toBe('tfiber-1gig');
    expect(text()).toContain('Filled from your screenshot. Check before you submit.');
    // Prefilled, not submitted.
    expect(createSale).not.toHaveBeenCalled();
  });

  it('flags unsure fields "Check this" until the rep edits or focuses them', async () => {
    await mount();
    scanReplies.push(READ);
    await upload(P1);
    expect(checkTags().map((l) => l.htmlFor).sort()).toEqual(['customerPhone', 'installDate']);

    await type('customerPhone', '(512) 555-0188');
    expect(checkTags().map((l) => l.htmlFor)).toEqual(['installDate']);

    await act(async () => field('installDate').focus());
    expect(checkTags()).toHaveLength(0);
  });

  it('falls back quietly when the read fails, times out or errors', async () => {
    await mount();
    scanReplies.push({ fields: null, reason: 'timeout' });
    await upload(P1);
    expect(text()).toContain("Couldn't read it. Fill it in below.");
    expect(field('customerAddress').value).toBe('');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('says nothing when the reader is switched off, and stops asking', async () => {
    await mount();
    scanReplies.push({ status: 404 });
    await upload(P1);
    expect(text()).not.toContain("Couldn't read it");
    expect(text()).not.toContain('Reading your screenshot');
    await upload(P2);
    expect(scanBodies).toHaveLength(1);
  });

  it('never reads the same screenshot twice; a new one fills only what is still empty', async () => {
    await mount();
    const partial: SaleScanResponse = {
      fields: { ...READ.fields, customerPhone: undefined },
    };
    scanReplies.push(partial);
    await upload(P1);
    await upload(P1);
    expect(scanBodies).toHaveLength(1);
    expect(field('customerPhone').value).toBe('');

    scanReplies.push({
      fields: {
        customerName: { value: 'Someone Else', confidence: 'high' },
        customerPhone: { value: '(512) 555-0187', confidence: 'high' },
      },
    });
    await upload(P2);
    expect(scanBodies[1]).toEqual({ paths: [P1, P2] });
    expect(field('customerPhone').value).toBe('(512) 555-0187');
    expect(field('customerName').value).toBe('Marisol Keene');
  });

  it('does not read at all once the rep has started the sale by hand', async () => {
    await mount();
    await type('customerAddress', '9 Oak St, Waco, TX');
    await upload(P1);
    expect(scanBodies).toHaveLength(0);
  });

  it('shows the reading state, and Skip cancels it without filling', async () => {
    await mount();
    let answer: (value: SaleScanResponse) => void = () => {};
    scanReplies.push(new Promise<SaleScanResponse>((resolve) => (answer = resolve)));
    await upload(P1);
    expect(text()).toContain('Reading your screenshot…');
    expect(field('customerAddress').getAttribute('aria-busy')).toBe('true');
    // The rep can keep typing while it reads.
    await type('customerName', 'Typed');
    expect(field('customerName').getAttribute('aria-busy')).toBeNull();

    const skip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Skip')!;
    await act(async () => skip.click());
    await act(async () => {
      answer(READ);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(text()).not.toContain('Reading your screenshot');
    expect(field('customerAddress').value).toBe('');
    expect(field('customerAddress').getAttribute('aria-busy')).toBeNull();
    expect(field('customerName').value).toBe('Typed');
  });
});
