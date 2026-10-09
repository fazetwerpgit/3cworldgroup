// @vitest-environment jsdom
//
// Log several sales: pick screenshots, each is uploaded and read (three at a
// time), the list flags repeats and what is missing, "Log N sales" sends the
// ready ones one at a time under their own keys, an order already on the books
// can be logged anyway, and a saved batch never resends what was logged.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSaleData } from '@/types';
import type { SaleScanResponse } from '@/lib/sales/scan/types';
import { getPlanById } from '@/types';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import { BULK_KEY_PREFIX, newBulkRow, writeBulkBatch, type BulkRow } from '@/lib/sales/bulk/batch';

const createSale = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com', status: 'active' } }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ createSale, loading: false, error: null }),
  NO_SIGNAL_SALE_MESSAGE: 'No signal',
}));
vi.mock('@/hooks/useCompPlan', () => ({
  useCompPlan: () => ({ rates: {}, hasPlan: true, loading: false }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'tok' }));
vi.mock('@/lib/forms/uploadFormAttachment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/uploadFormAttachment')>()),
  prepareFormFile: async (file: File) => file,
}));

// Uploads wait until the test lets them through, so the concurrency shows.
type PendingUpload = { name: string; key: string; resolve: (path: string) => void };
let uploads: PendingUpload[];
let uploadCalls: number;
const pathByName = new Map<string, string>();
vi.mock('./ProofCapture', () => ({
  PROOF_ACCEPT: 'image/*,application/pdf',
  ProofCapture: () => null,
  useProofUploads: () => ({}),
  proofUploadMessage: () => 'Upload failed',
  signedProofUrl: async () => null,
  uploadProofFile: (file: File, key: string) => {
    uploadCalls += 1;
    return new Promise<string>((resolve) => uploads.push({ name: file.name, key, resolve }));
  },
}));

import { RepBulkLog } from './RepBulkLog';
import { useBulkLog } from './useBulkLog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (order: string, name: string): SaleScanResponse => ({
  fields: {
    orderNumberOrBtn: { value: order, confidence: 'high' },
    customerName: { value: name, confidence: 'high' },
    customerAddress: { value: `${name} St, Austin, TX`, confidence: 'high' },
    installDate: { value: '2099-10-06', confidence: 'high' },
    provider: { value: 'tfiber', confidence: 'high' },
    plan: { value: 'tfiber-1gig', confidence: 'high' },
  },
});
const SCANS: Record<string, SaleScanResponse> = {
  'a.png': read('TMF-1', 'Ana Ruiz'),
  'b.png': read('TMF-2', 'Ben Cole'),
  'a-again.png': read('TMF-1', 'Ana Ruiz'),
  'c.png': { fields: null, reason: 'model_error' },
  'd.png': read('tmf 2', 'Ben Cole'),
  'busy.png': { fields: null, reason: 'rate_limited' },
};

let container: HTMLDivElement;
let root: Root;
let scanned: string[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RepBulkLog />));
}

async function pick(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await settle();
}

/** Let every upload waiting now through. */
async function finishUploads() {
  const waiting = uploads.splice(0);
  for (const upload of waiting) {
    const path = `form-attachments/r1/sale-proof/${upload.key}_abcdef/`;
    pathByName.set(path, upload.name);
    await act(async () => upload.resolve(path));
  }
  await settle();
}

const cards = () => Array.from(container.querySelectorAll('li'));
const cardText = (n: number) => cards()[n - 1]?.textContent ?? '';
const button = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
const logButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) => /^(Log \d+ sales?|Nothing ready|Reading|Logging)/.test(b.textContent ?? ''))!;

const png = (name: string, bytes: string) => new File([bytes], name, { type: 'image/png' });
const KEY = `${BULK_KEY_PREFIX}r1`;
const saved = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { rows: BulkRow[] } | null;

/** A saved, ready row: `letter` picks the id ("aaaa…"), order number and address. */
function savedRow(letter: string, over: Partial<BulkRow> = {}): BulkRow {
  const id = letter.repeat(32);
  const base = newBulkRow(id, `${letter}.png`);
  return {
    ...base,
    phase: 'read',
    proofPath: `form-attachments/r1/sale-proof/${id}_abcdef/`,
    products: addPlanToProducts([], getPlanById('tfiber-1gig')!),
    formData: { ...base.formData, customerAddress: `${letter} Elm St`, installDate: '2099-01-02', orderNumberOrBtn: `ORD-${letter}` },
    ...over,
  };
}

/** createSale calls that wait until the test answers them. */
function deferredSales() {
  const waiting: Array<(value: unknown) => void> = [];
  createSale.mockImplementation(
    (data: CreateSaleData) =>
      new Promise((resolve) => waiting.push(() => resolve({ sale: { id: `sale-${data.clientSaleId}` }, duplicate: false })))
  );
  return {
    async answerNext() {
      await act(async () => waiting.shift()?.(undefined));
      await settle();
    },
  };
}

beforeEach(() => {
  vi.stubEnv('SALE_SCAN_ENABLED', 'true');
  window.localStorage.clear();
  window.sessionStorage.clear();
  createSale.mockReset();
  uploads = [];
  uploadCalls = 0;
  scanned = [];
  pathByName.clear();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('/api/portal/sales/scan')) return json({ url: null });
      const { paths } = JSON.parse(String(init?.body)) as { paths: string[] };
      const name = pathByName.get(paths[0]) ?? '';
      scanned.push(name);
      return json(SCANS[name] ?? { fields: null, reason: 'unknown' });
    })
  );
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('RepBulkLog', () => {
  it('reads a batch three at a time, flags repeats and gaps, then logs the ready ones', async () => {
    await render();
    expect(container.textContent).toContain('Up to 25 at a time');

    await pick([
      png('a.png', 'AAAA'),
      png('b.png', 'BBBB'),
      png('a-again.png', 'AAAA'),
      png('c.png', 'CCCC'),
      png('d.png', 'DDDD'),
    ]);
    expect(cards()).toHaveLength(5);
    // Three uploads at a time.
    expect(uploadCalls).toBe(3);
    expect(cardText(1)).toContain('Uploading');
    expect(logButton().textContent).toBe('Reading 5 of 5…');
    expect(logButton().disabled).toBe(true);

    await finishUploads();
    expect(uploadCalls).toBe(5);
    await finishUploads();
    expect(scanned.sort()).toEqual(['a-again.png', 'a.png', 'b.png', 'c.png', 'd.png']);

    expect(cardText(1)).toContain('Ana Ruiz');
    expect(cardText(1)).toContain('Ready');
    expect(cardText(2)).toContain('Ready');
    expect(cardText(3)).toContain('Repeated: same screenshot as sale 1');
    expect(cardText(4)).toContain("Couldn't read it. Tap to fill in.");
    expect(cardText(5)).toContain('Repeated: same order number as sale 2');
    // Repeats start unticked.
    const boxes = cards().map((li) => li.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked);
    expect(boxes).toEqual([true, true, false, true, false]);
    expect(logButton().textContent).toBe('Log 2 sales');

    // Sale 2's order is already on the books.
    createSale.mockImplementation(async (data: CreateSaleData) =>
      data.orderNumberOrBtn === 'TMF-2' && !data.allowDuplicate
        ? {
            orderDuplicate: {
              existingSaleId: null,
              existingRepName: 'Dana W.',
              existingSaleDate: '2026-09-14T12:00:00.000Z',
              existingCustomerFirstName: null,
              existingIsMine: false,
            },
          }
        : { sale: { id: `sale-${data.clientSaleId}` }, duplicate: false }
    );
    await act(async () => logButton().click());
    await settle();

    expect(createSale).toHaveBeenCalledTimes(2);
    const [first, second] = createSale.mock.calls.map((call) => call[0] as CreateSaleData);
    expect(first.clientSaleId).toMatch(/^[a-f0-9]{32}$/);
    expect(second.clientSaleId).toMatch(/^[a-f0-9]{32}$/);
    expect(first.clientSaleId).not.toBe(second.clientSaleId);
    // The proof is the row's own upload, under its own key.
    expect(first.proofScreenshotPaths).toEqual([`form-attachments/r1/sale-proof/${first.clientSaleId}_abcdef/`]);
    expect(first).toMatchObject({ customerName: 'Ana Ruiz', orderNumberOrBtn: 'TMF-1', installDate: '2099-10-06' });
    expect(first.allowDuplicate).toBeUndefined();

    expect(cardText(1)).toContain('Logged');
    expect(cardText(2)).toContain('Already logged by Dana W. on Sep 14.');
    expect(container.textContent).toContain('1 logged, 1 already logged, 1 needs info, 2 skipped');
    expect(container.querySelector('a[href="/portal/sales"]')?.textContent).toBe('Go to Sales');
    // Sale 4 is ticked but still needs info: the batch stays saved for later.
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect(saved()?.rows.find((row) => row.id === first.clientSaleId)?.result?.kind).toBe('logged');

    await act(async () => button('Log anyway')!.click());
    await settle();
    expect(createSale).toHaveBeenCalledTimes(3);
    const anyway = createSale.mock.calls[2][0] as CreateSaleData;
    expect(anyway.clientSaleId).toBe(second.clientSaleId);
    expect(anyway.allowDuplicate).toBe(true);
    expect(cardText(2)).toContain('Logged');
    expect(container.textContent).toContain('2 logged, 1 needs info, 2 skipped');
  });

  it('fills in a screenshot it could not read with the Log Sale fields', async () => {
    await render();
    await pick([png('c.png', 'CCCC')]);
    await finishUploads();
    expect(cardText(1)).toContain("Couldn't read it.");

    await act(async () => cards()[0].querySelector<HTMLButtonElement>('button[aria-label="Check sale 1"]')!.click());
    const sheet = document.body.querySelector('[role="dialog"]')!;
    expect(sheet.textContent).toContain('No plan · No address · No install date');

    const setValue = async (id: string, value: string, event: 'input' | 'change' = 'input') => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event(event, { bubbles: true }));
      });
    };
    await setValue('plan', 'tfiber-1gig', 'change');
    await setValue('customerAddress', '9 Oak Ln, Austin, TX');
    await setValue('installDate', '2099-11-02');
    expect(sheet.textContent).toContain('Ready to log');

    await act(async () => button('Save')!.click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(cardText(1)).toContain('9 Oak Ln');
    expect(cardText(1)).toContain('Ready');
    expect(logButton().textContent).toBe('Log 1 sale');
  });

  it('picks up a saved batch without sending anything again', async () => {
    const base = newBulkRow('a'.repeat(32), 'a.png');
    const row = (id: string, over: Partial<BulkRow>): BulkRow => ({
      ...base,
      id,
      phase: 'read',
      proofPath: `form-attachments/r1/sale-proof/${id}_abcdef/`,
      products: addPlanToProducts([], getPlanById('tfiber-1gig')!),
      formData: { ...base.formData, customerAddress: '1 Elm St', installDate: '2099-01-02', orderNumberOrBtn: id.slice(0, 6) },
      ...over,
    });
    writeBulkBatch(`${BULK_KEY_PREFIX}r1`, [
      row('a'.repeat(32), { result: { kind: 'logged', saleId: 's1' } }),
      row('b'.repeat(32), {}),
      { ...newBulkRow('c'.repeat(32), 'c.png') }, // never uploaded
    ]);
    await render();
    await settle();
    expect(createSale).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Picking up where you left off');
    expect(container.textContent).toContain("1 screenshot didn't finish uploading. Pick it again.");
    expect(cards()).toHaveLength(2);
    expect(cardText(1)).toContain('Logged');
    expect(logButton().textContent).toBe('Log 1 sale');

    createSale.mockResolvedValue({ sale: { id: 's2' }, duplicate: false });
    await act(async () => logButton().click());
    await settle();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect((createSale.mock.calls[0][0] as CreateSaleData).clientSaleId).toBe('b'.repeat(32));
  });

  it('keeps Start over off while sending, and a closed page sends nothing more', async () => {
    writeBulkBatch(KEY, [savedRow('a'), savedRow('b'), savedRow('c')]);
    await render();
    await settle();
    const sales = deferredSales();
    await act(async () => logButton().click());
    await settle();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(button('Start over')!.disabled).toBe(true);

    // The rep closes the app mid-send; the sale in flight still lands.
    await act(async () => root.unmount());
    await sales.answerNext();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(saved()?.rows.map((row) => row.result?.kind ?? null)).toEqual(['logged', null, null]);

    // Coming back picks up the rest.
    container.remove();
    await render();
    await settle();
    expect(cardText(1)).toContain('Logged');
    expect(logButton().textContent).toBe('Log 2 sales');
  });

  it('Start over during a send stops the rest and forgets the batch', async () => {
    writeBulkBatch(KEY, [savedRow('a'), savedRow('b'), savedRow('c')]);
    let bulk!: ReturnType<typeof useBulkLog>;
    function Harness({ expose }: { expose: (value: ReturnType<typeof useBulkLog>) => void }) {
      const value = useBulkLog();
      useEffect(() => {
        expose(value);
      });
      return null;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness expose={(value) => (bulk = value)} />));
    await settle();
    const sales = deferredSales();
    await act(async () => void bulk.logAll());
    await settle();
    expect(createSale).toHaveBeenCalledTimes(1);

    await act(async () => bulk.startOver());
    await sales.answerNext();
    await settle();
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(bulk.rows).toHaveLength(0);
    expect(bulk.sending).toBe(false);
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect(saved()).toBeNull();
  });

  it('keeps the saved batch until every ticked sale is in', async () => {
    writeBulkBatch(KEY, [savedRow('a'), savedRow('b')]);
    await render();
    await settle();
    createSale.mockImplementation(async (data: CreateSaleData, options?: { onError?: (m: string) => void }) => {
      if (data.clientSaleId === 'b'.repeat(32)) {
        options?.onError?.('No signal. Your entry is saved, tap Submit to retry.');
        return null;
      }
      return { sale: { id: `sale-${data.clientSaleId}` }, duplicate: false };
    });
    await act(async () => logButton().click());
    await settle();
    expect(cardText(2)).toContain('Not logged. No signal. Tap Log again to retry.');
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect(saved()?.rows.map((row) => row.result?.kind)).toEqual(['logged', 'failed']);

    createSale.mockResolvedValue({ sale: { id: 'sale-b' }, duplicate: false });
    await act(async () => logButton().click());
    await settle();
    expect(cardText(2)).toContain('Logged');
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect(saved()).toBeNull();
  });

  it('says when the reader is busy, and Read again tries once more', async () => {
    await render();
    await pick([png('busy.png', 'BUSY')]);
    await finishUploads();
    expect(cardText(1)).toContain('Too many reads right now. Try again in a few minutes.');

    await act(async () => button('Read again')!.click());
    await settle();
    expect(scanned).toEqual(['busy.png', 'busy.png']);
    expect(cardText(1)).toContain('Too many reads right now.');

    SCANS['busy.png'] = read('TMF-9', 'Cy Park');
    try {
      await act(async () => button('Read again')!.click());
      await settle();
    } finally {
      SCANS['busy.png'] = { fields: null, reason: 'rate_limited' };
    }
    expect(cardText(1)).toContain('Cy Park');
    expect(cardText(1)).toContain('Ready');
  });

  it('says when an earlier send landed and the edit since did not', async () => {
    writeBulkBatch(KEY, [savedRow('a', { result: { kind: 'logged', saleId: 's1', editLost: true } })]);
    await render();
    await settle();
    expect(cardText(1)).toContain("Logged, but your changes weren't saved. Edit this sale from Sales.");
  });

  it('frees the preview of a removed screenshot', async () => {
    await render();
    await pick([png('a.png', 'AAAA'), png('b.png', 'BBBB')]);
    await finishUploads();
    await finishUploads();
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => cards()[0].querySelector<HTMLButtonElement>('button[aria-label="Remove sale 1"]')!.click());
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(cards()).toHaveLength(1);
  });

  it('takes 25 at most and says so', async () => {
    await render();
    await pick(Array.from({ length: 27 }, (_, i) => png(`s${i}.png`, `bytes-${i}`)));
    expect(cards()).toHaveLength(25);
    expect(container.textContent).toContain('Only 25 at a time. The extra ones were left off.');
  });
});
