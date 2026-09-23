import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  saleGetMock,
  saleDeleteMock,
  linkedGetMock,
  whereMock,
  batchUpdateMock,
  batchCommitMock,
  gateMock,
  requesterMock,
  saleUpdateMock,
  invalidateMock,
  deleteSentinel,
} = vi.hoisted(() => ({
  saleGetMock: vi.fn(),
  saleDeleteMock: vi.fn(),
  linkedGetMock: vi.fn(),
  whereMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  batchCommitMock: vi.fn(),
  gateMock: vi.fn(),
  requesterMock: vi.fn(),
  saleUpdateMock: vi.fn(),
  invalidateMock: vi.fn(),
  deleteSentinel: { __delete: true },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'fiberOrders') return { where: whereMock };
      return {
        doc: vi.fn(() => ({ get: saleGetMock, delete: saleDeleteMock, update: saleUpdateMock })),
      };
    }),
    batch: vi.fn(() => ({ update: batchUpdateMock, commit: batchCommitMock })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => deleteSentinel },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: gateMock,
  requireVerifiedRequester: requesterMock,
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({
  invalidateFiberOrdersCache: invalidateMock,
}));

import { DELETE, PUT } from './route';
import { dateToSaleDateInput } from '@/lib/sales/saleDate';

function del(id = 'sale-1') {
  return DELETE(
    new NextRequest(`http://localhost/api/portal/sales/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin' });
  requesterMock.mockResolvedValue({ ok: true, uid: 'rep-1', name: 'Rep One', isAdmin: false });
  saleUpdateMock.mockResolvedValue(undefined);
  saleGetMock.mockResolvedValue({ exists: true, data: () => ({ salesRepId: 'rep-1' }) });
  saleDeleteMock.mockResolvedValue(undefined);
  batchCommitMock.mockResolvedValue(undefined);
  whereMock.mockReturnValue({ get: linkedGetMock });
  linkedGetMock.mockResolvedValue({ empty: true, size: 0, docs: [] });
});

describe('DELETE /api/portal/sales/[id] saleLink cleanup', () => {
  it('clears saleLink on every order pointing at the deleted sale', async () => {
    const refA = { id: 'order-a' };
    const refB = { id: 'order-b' };
    linkedGetMock.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [{ ref: refA }, { ref: refB }],
    });

    const response = await del('sale-1');
    const json = await response.json();

    expect(whereMock).toHaveBeenCalledWith('saleLink.saleId', '==', 'sale-1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchUpdateMock).toHaveBeenCalledWith(
      refA,
      { saleLink: deleteSentinel, updatedAt: expect.any(String) }
    );
    expect(batchCommitMock).toHaveBeenCalledOnce();
    expect(invalidateMock).toHaveBeenCalledOnce();
    expect(saleDeleteMock).toHaveBeenCalledOnce();
    expect(json).toEqual({ success: true, clearedLinks: 2 });
  });

  it('skips the batch when nothing links to the sale', async () => {
    const json = await (await del()).json();

    expect(batchUpdateMock).not.toHaveBeenCalled();
    expect(batchCommitMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
    expect(saleDeleteMock).toHaveBeenCalledOnce();
    expect(json).toEqual({ success: true, clearedLinks: 0 });
  });

  it('leaves the sale in place when clearing the links fails', async () => {
    // Links are cleared BEFORE the delete precisely so a failure here cannot
    // strand a link behind a sale that is already gone.
    linkedGetMock.mockResolvedValue({ empty: false, size: 1, docs: [{ ref: { id: 'o' } }] });
    batchCommitMock.mockRejectedValue(new Error('firestore down'));

    const response = await del();

    expect(response.status).toBe(500);
    expect(saleDeleteMock).not.toHaveBeenCalled();
  });

  it('does not touch fiberOrders for an unknown sale', async () => {
    saleGetMock.mockResolvedValue({ exists: false, data: () => undefined });

    const response = await del('nope');

    expect(response.status).toBe(404);
    expect(whereMock).not.toHaveBeenCalled();
    expect(saleDeleteMock).not.toHaveBeenCalled();
  });
});

/** A day inside the install-date window, as the form sends it. */
function dayInput(offsetDays: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return dateToSaleDateInput(date);
}

function put(body: Record<string, unknown>, id = 'sale-1') {
  return PUT(
    new NextRequest(`http://localhost/api/portal/sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PUT /api/portal/sales/[id] install date provenance', () => {
  it('stamps the owning rep as the source when they move the date', async () => {
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: new Date('2026-09-01T17:00:00.000Z') }),
    });

    const response = await put({ installDate: dayInput(7) });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.installDateSource).toBe('rep');
    expect(written.installDateChangedAt).toBeInstanceOf(Date);
    expect(written.installDatePreviousDate).toEqual(new Date('2026-09-01T17:00:00.000Z'));
  });

  it('stamps admin when management edits another rep sale', async () => {
    requesterMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: null }),
    });

    await put({ installDate: dayInput(7) });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.installDateSource).toBe('admin');
    expect(written.installDatePreviousDate).toBeNull();
  });

  it('does not restamp a re-save that leaves the day alone', async () => {
    const today = dayInput(0);
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: new Date(`${today}T17:00:00.000Z`) }),
    });

    await put({ installDate: today, notes: 'typo fixed' });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.notes).toBe('typo fixed');
    expect(written.installDateSource).toBeUndefined();
    expect(written.installDateChangedAt).toBeUndefined();
  });

  it('rejects an install date the parser refuses', async () => {
    saleGetMock.mockResolvedValue({ exists: true, data: () => ({ salesRepId: 'rep-1' }) });

    const response = await put({ installDate: '2026-02-31' });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/portal/sales/[id] proof screenshots', () => {
  const PREFIX = 'form-attachments/rep-1/sale-proof/';
  const SHOT_A = `${PREFIX}slotaaaa_a1b2c3/`;
  const SHOT_B = `${PREFIX}slotaaaa_d4e5f6/`;
  const SHOT_C = `${PREFIX}slotaaaa_0a0b0c/`;

  function existingSale(fields: Record<string, unknown>) {
    saleGetMock.mockResolvedValue({ exists: true, data: () => ({ salesRepId: 'rep-1', ...fields }) });
  }

  it('adds a screenshot within the cap and writes both fields', async () => {
    existingSale({ proofScreenshotPaths: [SHOT_A], proofScreenshotPath: SHOT_A });

    const response = await put({ proofScreenshotPaths: [SHOT_A, SHOT_B], proofScreenshotPath: SHOT_A });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toEqual([SHOT_A, SHOT_B]);
    expect(written.proofScreenshotPath).toBe(SHOT_A);
  });

  it('removes a screenshot and re-mirrors the first', async () => {
    existingSale({ proofScreenshotPaths: [SHOT_A, SHOT_B], proofScreenshotPath: SHOT_A });

    await put({ proofScreenshotPaths: [SHOT_B] });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toEqual([SHOT_B]);
    expect(written.proofScreenshotPath).toBe(SHOT_B);
  });

  it('rejects more than four screenshots', async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const response = await put({
      proofScreenshotPaths: [SHOT_A, SHOT_B, SHOT_C, `${PREFIX}s4_111111/`, `${PREFIX}s5_222222/`],
    });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects the edit when any one path is not the sale rep's own", async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const response = await put({ proofScreenshotPaths: [SHOT_A, 'form-attachments/rep-2/sale-proof/x/'] });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects a path with ..', async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const response = await put({ proofScreenshotPaths: [`${PREFIX}../../rep-2/sale-proof/x/`] });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it("lets an admin attach proof they uploaded to a rep's sale", async () => {
    requesterMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const own = await put({ proofScreenshotPaths: [SHOT_A] });
    expect(own.status).toBe(200);

    const adminShot = 'form-attachments/admin-1/sale-proof/x_123456/';
    const adminPath = await put({ proofScreenshotPaths: [SHOT_A, adminShot] });
    expect(adminPath.status).toBe(200);
    expect(saleUpdateMock.mock.calls.at(-1)?.[0].proofScreenshotPaths).toEqual([SHOT_A, adminShot]);
  });

  it("still refuses an admin a third party's prefix or a climb out of their own", async () => {
    requesterMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const other = await put({ proofScreenshotPaths: ['form-attachments/rep-2/sale-proof/x_123456/'] });
    expect(other.status).toBe(400);
    const climb = await put({ proofScreenshotPaths: ['form-attachments/admin-1/sale-proof/../../rep-2/x/'] });
    expect(climb.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it("keeps a rep on their own prefix, even an admin's", async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1' });
    const response = await put({ proofScreenshotPaths: ['form-attachments/admin-1/sale-proof/x_123456/'] });
    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it('lets the rep re-save a sale that carries an admin-uploaded screenshot', async () => {
    const adminShot = 'form-attachments/admin-1/sale-proof/x_123456/';
    existingSale({ proofScreenshotPaths: [adminShot], proofScreenshotPath: adminShot });
    const response = await put({ proofScreenshotPaths: [adminShot, SHOT_A] });
    expect(response.status).toBe(200);
    expect(saleUpdateMock.mock.calls.at(-1)?.[0].proofScreenshotPaths).toEqual([adminShot, SHOT_A]);
  });

  it('turns a legacy single-path sale into a list when a screenshot is added', async () => {
    existingSale({ proofScreenshotPath: SHOT_A });

    await put({ proofScreenshotPaths: [SHOT_A, SHOT_B] });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toEqual([SHOT_A, SHOT_B]);
    expect(written.proofScreenshotPath).toBe(SHOT_A);
  });

  it('accepts a legacy single-field edit from an older client', async () => {
    existingSale({ proofScreenshotPath: SHOT_A });

    const response = await put({ proofScreenshotPath: SHOT_B });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toEqual([SHOT_B]);
    expect(written.proofScreenshotPath).toBe(SHOT_B);
  });

  it('does not collapse a multi-screenshot sale when an older client re-sends the first path', async () => {
    existingSale({ proofScreenshotPaths: [SHOT_A, SHOT_B], proofScreenshotPath: SHOT_A });

    const response = await put({ proofScreenshotPath: SHOT_A, notes: 'typo' });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toBeUndefined();
    expect(written.proofScreenshotPath).toBeUndefined();
    expect(written.notes).toBe('typo');
  });

  it('leaves the stored screenshots alone when the edit sends neither field', async () => {
    existingSale({ proofScreenshotPaths: [SHOT_A, SHOT_B], proofScreenshotPath: SHOT_A });

    await put({ notes: 'typo' });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toBeUndefined();
    expect(written.proofScreenshotPath).toBeUndefined();
  });

  it('allows removing every screenshot when the sale keeps an order number', async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1', proofScreenshotPaths: [SHOT_A], proofScreenshotPath: SHOT_A });

    const response = await put({ proofScreenshotPaths: [], proofScreenshotPath: '' });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.proofScreenshotPaths).toEqual([]);
    expect(written.proofScreenshotPath).toBe('');
  });

  it('rejects removing the last screenshot from a sale with no order number', async () => {
    existingSale({ orderNumberOrBtn: '', proofScreenshotPaths: [SHOT_A], proofScreenshotPath: SHOT_A });

    const response = await put({ proofScreenshotPaths: [], orderNumberOrBtn: '' });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects clearing the order number from a sale with no screenshot', async () => {
    existingSale({ orderNumberOrBtn: 'ORD-1' });

    const response = await put({ orderNumberOrBtn: '   ' });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });

  it('still lets a pre-rule sale with no proof be corrected', async () => {
    existingSale({});

    const response = await put({ orderNumberOrBtn: '', proofScreenshotPaths: [], notes: 'fixed' });

    expect(response.status).toBe(200);
  });
});
