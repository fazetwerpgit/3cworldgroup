import { describe, it, expect, vi, beforeEach } from 'vitest';

const add = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'f1' }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ add }) },
}));

import { submitFormRecord, DEMO_FORM_STATUS } from './submitForm';

beforeEach(() => add.mockClear());

describe('submitFormRecord', () => {
  it("writes a real rep's form as 'new', with no demo stamp", async () => {
    await submitFormRecord('payrollDisputes', { uid: 'u1', name: 'Rep', email: 'r@x.com' }, { a: 1 });
    const doc = add.mock.calls[0][0];
    expect(doc).toMatchObject({ a: 1, repUid: 'u1', status: 'new' });
    expect(doc).not.toHaveProperty('demoAccount');
  });

  it("stamps a demo account's form and keeps it out of status == 'new'", async () => {
    await submitFormRecord('payrollDisputes', { uid: 'd1', name: 'Sam', email: 's@x.com', demoAccount: true }, {});
    const doc = add.mock.calls[0][0];
    expect(doc).toMatchObject({ repUid: 'd1', demoAccount: true, status: DEMO_FORM_STATUS });
    expect(doc.status).not.toBe('new');
  });

  it('ignores the field-level form data trying to set status or the stamp', async () => {
    await submitFormRecord('payrollDisputes', { uid: 'd1', name: 'Sam', email: 's@x.com', demoAccount: true }, { status: 'new', demoAccount: false });
    expect(add.mock.calls[0][0]).toMatchObject({ demoAccount: true, status: DEMO_FORM_STATUS });
  });
});
