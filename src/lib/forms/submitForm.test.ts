import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Firestore: add() makes a fresh id; doc(id).create() rejects an
// existing doc the way the Admin SDK does (gRPC ALREADY_EXISTS, code 6).
const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  let n = 0;
  const collection = vi.fn((name: string) => ({
    add: vi.fn(async (data: Record<string, unknown>) => {
      const id = `auto${++n}`;
      docs.set(`${name}/${id}`, data);
      return { id };
    }),
    doc: (id: string) => ({
      id,
      create: vi.fn(async (data: Record<string, unknown>) => {
        // Yield first so concurrent calls interleave before either writes.
        await Promise.resolve();
        if (docs.has(`${name}/${id}`)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
        docs.set(`${name}/${id}`, data);
      }),
    }),
  }));
  return { docs, collection, reset: () => { docs.clear(); n = 0; } };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: fake.collection } }));

import { submitFormRecord, DEMO_FORM_STATUS } from './submitForm';

const REP = { uid: 'u1', name: 'Rep One', email: 'rep@x.com' };

beforeEach(() => fake.reset());

describe('submitFormRecord', () => {
  it('without a clientId adds a new record every time', async () => {
    const a = await submitFormRecord('fiberReports', REP, { packNumber: '7' });
    const b = await submitFormRecord('fiberReports', REP, { packNumber: '7' });
    expect(a).toEqual({ id: 'auto1', duplicate: false });
    expect(b).toEqual({ id: 'auto2', duplicate: false });
    expect(fake.docs.size).toBe(2);
    expect(fake.docs.get('fiberReports/auto1')).not.toHaveProperty('clientId');
  });

  it('with a clientId writes one record keyed by uid + clientId and stores the id on it', async () => {
    const first = await submitFormRecord('fiberReports', REP, { packNumber: '7' }, { clientId: 'r1' });
    const again = await submitFormRecord('fiberReports', REP, { packNumber: '7' }, { clientId: 'r1' });
    expect(first).toEqual({ id: 'u1_r1', duplicate: false });
    expect(again).toEqual({ id: 'u1_r1', duplicate: true });
    expect(fake.docs.size).toBe(1);
    expect(fake.docs.get('fiberReports/u1_r1')).toMatchObject({ clientId: 'r1', repUid: 'u1', status: 'new' });
  });

  it('two concurrent identical requests create exactly one record', async () => {
    const results = await Promise.all([
      submitFormRecord('fiberReports', REP, { packNumber: '7' }, { clientId: 'race' }),
      submitFormRecord('fiberReports', REP, { packNumber: '7' }, { clientId: 'race' }),
    ]);
    expect(results.map((r) => r.id)).toEqual(['u1_race', 'u1_race']);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(fake.docs.size).toBe(1);
  });

  it('the same clientId from a different rep is a separate record', async () => {
    await submitFormRecord('fiberReports', REP, {}, { clientId: 'r1' });
    const other = await submitFormRecord('fiberReports', { ...REP, uid: 'u2' }, {}, { clientId: 'r1' });
    expect(other).toEqual({ id: 'u2_r1', duplicate: false });
    expect(fake.docs.size).toBe(2);
  });

  it('rethrows any other write error', async () => {
    fake.collection.mockImplementationOnce(() => ({
      doc: (id: string) => ({ id, create: async () => { throw Object.assign(new Error('boom'), { code: 14 }); } }),
    }) as never);
    await expect(submitFormRecord('fiberReports', REP, {}, { clientId: 'r1' })).rejects.toThrow('boom');
  });
  it("writes a real rep's form as 'new', with no demo stamp", async () => {
    await submitFormRecord('payrollDisputes', REP, { a: 1 });
    const doc = fake.docs.get('payrollDisputes/auto1');
    expect(doc).toMatchObject({ a: 1, repUid: 'u1', status: 'new' });
    expect(doc).not.toHaveProperty('demoAccount');
  });

  it("stamps a demo account's form and keeps it out of status == 'new'", async () => {
    await submitFormRecord('payrollDisputes', { uid: 'd1', name: 'Sam', email: 's@x.com', demoAccount: true }, {});
    const doc = fake.docs.get('payrollDisputes/auto1');
    expect(doc).toMatchObject({ repUid: 'd1', demoAccount: true, status: DEMO_FORM_STATUS });
    expect(doc?.status).not.toBe('new');
  });

  it("stamps a test account's record testAccount: true and keeps the normal 'new' status", async () => {
    await submitFormRecord('solarLeads', { uid: 'qa', name: 'Test', email: 'q@x.com', testAccount: true }, { testAccount: false });
    const doc = fake.docs.get('solarLeads/auto1');
    expect(doc).toMatchObject({ repUid: 'qa', testAccount: true, status: 'new' });
    expect(doc).not.toHaveProperty('demoAccount');
  });

  it('ignores the field-level form data trying to set status or the stamp', async () => {
    await submitFormRecord('payrollDisputes', { uid: 'd1', name: 'Sam', email: 's@x.com', demoAccount: true }, { status: 'new', demoAccount: false });
    expect(fake.docs.get('payrollDisputes/auto1')).toMatchObject({ demoAccount: true, status: DEMO_FORM_STATUS });
  });

  it('a demo account form keyed by clientId still carries the demo stamp', async () => {
    await submitFormRecord('payrollDisputes', { uid: 'd1', name: 'Sam', email: 's@x.com', demoAccount: true }, {}, { clientId: 'r1' });
    expect(fake.docs.get('payrollDisputes/d1_r1')).toMatchObject({ demoAccount: true, status: DEMO_FORM_STATUS, clientId: 'r1' });
  });
});
