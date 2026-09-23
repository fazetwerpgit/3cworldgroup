// @vitest-environment jsdom
//
// The shared new-sale state: validation, the sessionStorage draft (including a
// draft saved by the single-screenshot build), multi-screenshot proof and the
// submit payload.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSale = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com', reportsToId: 'm1' } }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ createSale, loading: false, error: null }),
}));

import { DRAFT_KEY_PREFIX, useSaleFormState, validateSaleForm, type SaleFormFields } from './useSaleFormState';
import { getPlanById } from '@/types';
import { todaySaleDateInput } from '@/lib/sales/saleDate';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DRAFT_KEY = `${DRAFT_KEY_PREFIX}r1`;
const PROOF = (n: number) => `form-attachments/r1/sale-proof/abc_${String(n).padStart(6, '0')}/`;

let container: HTMLDivElement;
let root: Root;
const latest: { current: ReturnType<typeof useSaleFormState> | null } = { current: null };

function Harness() {
  const state = useSaleFormState();
  useEffect(() => {
    latest.current = state;
  });
  return null;
}

/** The hook's state as of the last committed render. */
const api = new Proxy({} as ReturnType<typeof useSaleFormState>, {
  get: (_target, key) => (latest.current as unknown as Record<PropertyKey, unknown>)[key],
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
}

function fields(overrides: Partial<SaleFormFields> = {}): SaleFormFields {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '1 Main St',
    saleType: 'new_service',
    saleDate: todaySaleDateInput(),
    installDate: todaySaleDateInput(),
    notes: '',
    orderNumberOrBtn: '',
    ...overrides,
  };
}

const plan = getPlanById('tfiber-1gig')!;
const product = {
  productId: plan.id,
  productName: plan.name,
  company: plan.company,
  quantity: 1,
  unitPrice: plan.price,
  totalPrice: plan.price,
  points: plan.points,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  window.sessionStorage.clear();
  createSale.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.useRealTimers();
});

describe('validateSaleForm', () => {
  it('flags every missing required field', () => {
    const errors = validateSaleForm({
      formData: fields({ customerAddress: '', installDate: '' }),
      products: [],
      proofPaths: [],
    });
    expect(Object.keys(errors)).toEqual(['customerAddress', 'plan', 'installDate', 'orderNumberOrBtn']);
  });

  it('takes a screenshot or an order number as proof', () => {
    const base = { formData: fields(), products: [product] };
    expect(validateSaleForm({ ...base, proofPaths: [] }).orderNumberOrBtn).toBeTruthy();
    expect(validateSaleForm({ ...base, proofPaths: [PROOF(1)] })).toEqual({});
    expect(validateSaleForm({ ...base, formData: fields({ orderNumberOrBtn: 'TMF-1' }), proofPaths: [] })).toEqual({});
  });

  it('rejects a sale dated after its install and a future sale date', () => {
    const past = '2020-01-10';
    expect(
      validateSaleForm({
        formData: fields({ saleDate: '2020-01-12', installDate: past }),
        products: [product],
        proofPaths: [PROOF(1)],
      }).saleDate
    ).toMatch(/after the install/);
    expect(
      validateSaleForm({
        formData: fields({ saleDate: '2999-01-01', installDate: '2999-01-02' }),
        products: [product],
        proofPaths: [PROOF(1)],
      }).saleDate
    ).toMatch(/future/);
  });
});

describe('useSaleFormState', () => {
  it('saves a draft with every screenshot and the legacy first path', async () => {
    await mount();
    await act(async () => {
      api.setField('customerName', 'Alicia Martinez');
      api.addProofPath(PROOF(1));
      api.addProofPath(PROOF(2));
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    const saved = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!);
    expect(saved.formData.customerName).toBe('Alicia Martinez');
    expect(saved.formData.proofScreenshotPaths).toEqual([PROOF(1), PROOF(2)]);
    expect(saved.formData.proofScreenshotPath).toBe(PROOF(1));
    expect(saved.proofUploadId).toBe(api.proofUploadId);
  });

  it('restores a draft from the single-screenshot build', async () => {
    const id = 'a'.repeat(32);
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        formData: { ...fields({ customerName: 'Old Draft' }), proofScreenshotPath: PROOF(7) },
        products: [product],
        saleDateTouched: false,
        proofUploadId: id,
      })
    );
    await mount();
    expect(api.fromDraft).toBe(true);
    expect(api.formData.customerName).toBe('Old Draft');
    expect(api.proofPaths).toEqual([PROOF(7)]);
    expect(api.proofUploadId).toBe(id);
    expect(api.products).toHaveLength(1);
  });

  it('caps proof screenshots at 4 and ignores duplicates', async () => {
    await mount();
    await act(async () => {
      for (let n = 1; n <= 6; n += 1) api.addProofPath(PROOF(n));
      api.addProofPath(PROOF(1));
    });
    expect(api.proofPaths).toEqual([PROOF(1), PROOF(2), PROOF(3), PROOF(4)]);
    await act(async () => api.removeProofPath(PROOF(2)));
    expect(api.proofPaths).toEqual([PROOF(1), PROOF(3), PROOF(4)]);
  });

  it('shows field errors and does not submit an incomplete sale', async () => {
    await mount();
    let result: unknown;
    await act(async () => {
      result = await api.submit();
    });
    expect(result).toBeNull();
    expect(createSale).not.toHaveBeenCalled();
    expect(api.errors.customerAddress).toBeTruthy();
    expect(api.errors.orderNumberOrBtn).toBeTruthy();
    // Editing a field clears its error.
    await act(async () => api.setField('customerAddress', '1 Main St'));
    expect(api.errors.customerAddress).toBeUndefined();
  });

  it('holds the submit while a screenshot is still uploading', async () => {
    await mount();
    await act(async () => {
      api.setField('customerAddress', '1 Main St');
      api.setField('installDate', todaySaleDateInput());
      api.setField('orderNumberOrBtn', 'TMF-1');
      api.addPlan(plan);
    });
    await act(async () => {
      await api.submit({ pendingUploads: 1 });
    });
    expect(createSale).not.toHaveBeenCalled();
    expect(api.blockError).toMatch(/still uploading/);
  });

  it('sends every screenshot, the idempotency key, and clears the draft on success', async () => {
    createSale.mockResolvedValue({ sale: { id: 'sale-1' }, duplicate: false });
    await mount();
    await act(async () => {
      api.setField('customerAddress', '1 Main St');
      api.setField('installDate', todaySaleDateInput());
      api.addPlan(plan);
      api.addProofPath(PROOF(1));
      api.addProofPath(PROOF(2));
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
    const key = api.proofUploadId;
    await act(async () => {
      await api.submit();
    });
    expect(createSale).toHaveBeenCalledTimes(1);
    const payload = createSale.mock.calls[0][0];
    expect(payload.proofScreenshotPaths).toEqual([PROOF(1), PROOF(2)]);
    expect(payload.proofScreenshotPath).toBe(PROOF(1));
    expect(payload.clientSaleId).toBe(key);
    // Confirmed: the next entry never reuses this sale's key.
    expect(api.proofUploadId).not.toBe(key);
    expect(api.proofUploadId).toMatch(/^[a-f0-9]{32}$/);
    expect(payload.salesRepId).toBe('r1');
    expect(payload.products).toHaveLength(1);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  async function fillSale(name = 'Carla Diaz') {
    await act(async () => {
      api.setField('customerName', name);
      api.setField('customerAddress', '1 Main St');
      api.setField('installDate', todaySaleDateInput());
      api.setField('orderNumberOrBtn', 'TMF-1');
      api.addPlan(plan);
    });
  }

  async function clearSale() {
    await act(async () => {
      for (const name of ['customerName', 'customerAddress', 'installDate', 'orderNumberOrBtn'] as const) {
        api.setField(name, '');
      }
      api.removeProduct(0);
    });
  }

  it('keeps the key for a retry after no answer, and a new key once the entry is cleared', async () => {
    createSale.mockResolvedValue(null); // no signal: the request may still have landed
    await mount();
    await fillSale();
    const key = api.proofUploadId;
    await act(async () => void (await api.submit()));
    expect(api.proofUploadId).toBe(key);
    await act(async () => void (await api.submit()));
    expect(createSale.mock.calls.map((call) => call[0].clientSaleId)).toEqual([key, key]);

    await clearSale();
    expect(api.proofUploadId).not.toBe(key);
    await fillSale('Somebody Else');
    await act(async () => void (await api.submit()));
    expect(createSale.mock.calls[2][0].clientSaleId).toBe(api.proofUploadId);
    expect(createSale.mock.calls[2][0].clientSaleId).not.toBe(key);
  });

  it('keeps the key when an entry that was never submitted is cleared', async () => {
    await mount();
    const key = api.proofUploadId;
    await fillSale();
    await clearSale();
    expect(api.proofUploadId).toBe(key);
  });

  it('remembers a used key in the draft, so clearing after a reload still starts fresh', async () => {
    const key = 'b'.repeat(32);
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        formData: fields({ customerName: 'Carla Diaz', orderNumberOrBtn: 'TMF-1' }),
        products: [product],
        saleDateTouched: false,
        proofUploadId: key,
        keyUsed: true,
      })
    );
    await mount();
    expect(api.proofUploadId).toBe(key);
    await clearSale();
    await act(async () => api.setField('customerAddress', ''));
    expect(api.proofUploadId).not.toBe(key);
  });

  it('holds a duplicate for the page instead of treating it as a new sale', async () => {
    const stored = { id: 'b'.repeat(32), customerName: 'Carla Diaz' };
    createSale.mockResolvedValue({ sale: stored, duplicate: true });
    await mount();
    await fillSale('Somebody Else');
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    const key = api.proofUploadId;
    let result: unknown;
    await act(async () => {
      result = await api.submit();
    });
    expect(result).toEqual({ sale: stored, duplicate: true });
    expect(api.duplicateOf).toEqual(stored);
    expect(api.proofUploadId).toBe(key);
    // The entry on screen may be a different customer: it is not thrown away.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();

    createSale.mockResolvedValue({ sale: { id: 'new-sale' }, duplicate: false });
    await act(async () => void (await api.logAsNew()));
    const retried = createSale.mock.calls[1][0].clientSaleId;
    expect(retried).not.toBe(key);
    expect(retried).toMatch(/^[a-f0-9]{32}$/);
    expect(api.duplicateOf).toBeNull();
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('drops the old provider’s plan and extras on a provider switch', async () => {
    await mount();
    await act(async () => {
      api.addPlan(getPlanById('xfinity-1gig')!);
      api.toggleExtra(getPlanById('xfinity-tv')!);
    });
    expect(api.provider).toBe('xfinity');
    expect(api.products).toHaveLength(2);
    await act(async () => api.toggleExtra(getPlanById('xfinity-tv')!));
    expect(api.products).toHaveLength(1);
    await act(async () => api.keepProvider('tfiber'));
    expect(api.products).toEqual([]);
  });
});
