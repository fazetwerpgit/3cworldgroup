import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAskDb } from './fakeAskDb';
import { loadRepSnapshot } from './liveData';

// loadRepSnapshot: only the asking rep's documents, never a pay or money
// field, contact details redacted, and a failing or slow section left out
// without taking the rest down. Every name and number here is made up.

type Firestore = FirebaseFirestore.Firestore;

// Sunday Sep 27 2026, 3:00 PM Central.
const NOW = new Date('2026-09-27T20:00:00.000Z');
const noon = (day: string) => new Date(`${day}T12:00:00.000Z`);

// Values no line may ever carry. Each is on a doc the snapshot reads.
const MONEY = ['4321', '9876', '5555.55', '1234', '777', '88.40', '612'];

function seed() {
  return {
    users: {
      r1: { city: 'Des Moines', state: 'IA', status: 'active', fieldRole: 'entry_rep', estimatedPay: 4321 },
      r2: { city: 'Lansing', state: 'MI', status: 'active', fieldRole: 'entry_rep' },
    },
    sales: {
      s1: {
        salesRepId: 'r1',
        salesRepName: 'Dana Rep',
        customerName: 'Maria Johnson',
        customerAddress: '1412 Oak St, Des Moines IA (gate code: call 515-555-0142 or maria@example.com)',
        customerPhone: '515-555-0199',
        customerEmail: 'maria.j@example.com',
        status: 'approved',
        saleDate: noon('2026-09-24'),
        installDate: noon('2026-09-29'),
        createdAt: new Date('2026-09-25T01:10:00.000Z'),
        orderNumberOrBtn: 'TMO-ORDER-1',
        products: [{ productName: 'T-Fiber 1 Gig', productId: 'tf1g', price: 9876 }],
        totalValue: 9876,
        totalPoints: 10,
        commission: 5555.55,
        estimatedPay: 4321,
        amount: 1234,
      },
      s2: {
        salesRepId: 'r1',
        salesRepName: 'Dana Rep',
        customerName: 'Tom Baker',
        customerAddress: '88 Elm Ave, Ankeny IA',
        status: 'cancelled',
        cancelReason: 'Customer backed out, $777 chargeback',
        saleDate: noon('2026-09-20'),
        createdAt: noon('2026-09-20'),
        proofScreenshotPaths: ['form-attachments/r1/sale-proof/a.png'],
        totalPoints: 10,
        payout: 777,
      },
      other: {
        salesRepId: 'r2',
        salesRepName: 'Jordan Price',
        customerName: 'Secret Neighbor',
        customerAddress: '9 Hidden Ln, Lansing MI',
        status: 'approved',
        saleDate: noon('2026-09-25'),
        createdAt: noon('2026-09-25'),
        totalPoints: 30,
      },
      third: {
        salesRepId: 'r3',
        salesRepName: 'Sam Lee',
        customerName: 'Third Party',
        customerAddress: '5 Far Rd, Ames IA',
        status: 'approved',
        saleDate: noon('2026-09-25'),
        createdAt: noon('2026-09-25'),
        totalPoints: 5,
      },
    },
    fiberOrders: {
      TMO1: { status: 'pending_install', matchedUserId: 'r1', address: '1412 Oak St', orderDate: '2026-09-24', estInstallDate: '2026-09-29', mrc: 88.4 },
      TMO2: { status: 'active', matchedUserId: 'r2', address: '9 Hidden Ln', orderDate: '2026-09-25', activationDate: '2026-09-26', mrc: 612 },
    },
    scheduledCalls: {
      c1: { title: 'Monday Team Call', day: 'monday', time: '19:00', timezone: 'America/Chicago', audience: 'all', active: true },
      c2: { title: 'Managers Only Sync', day: 'monday', time: '18:00', timezone: 'America/Chicago', audience: 'managers', active: true },
      c3: { title: 'Old Call', day: 'tuesday', time: '19:00', timezone: 'America/Chicago', audience: 'all', active: false },
    },
    expediteOrders: {
      e1: { repUid: 'r1', status: 'new', customerName: 'Maria Johnson', customerPhone: '515-555-0199', reason: 'Install too far out', createdAt: noon('2026-09-26') },
      e2: { repUid: 'r2', status: 'new', customerName: 'Secret Neighbor', reason: 'Install too far out', createdAt: noon('2026-09-26') },
    },
    payrollDisputes: {
      p1: { repUid: 'r1', status: 'new', typeOfOrder: 'New install', amount: 1234, expectedPay: 4321, createdAt: noon('2026-09-22') },
    },
    notifications: {
      n1: { userId: 'r1', type: 'install_reminder', title: 'Install tomorrow', message: 'Maria J. You earn $4321 on this one.', read: false, createdAt: noon('2026-09-26') },
      n2: { userId: 'r1', type: 'points_earned', title: 'Points', message: 'Worth 9876', read: false, createdAt: noon('2026-09-26') },
      n3: { userId: 'r2', type: 'install_reminder', title: 'Secret Neighbor installs', message: '', read: false, createdAt: noon('2026-09-26') },
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const load = (db: unknown, budget?: number) => loadRepSnapshot(db as Firestore, 'r1', NOW, budget);

describe('loadRepSnapshot', () => {
  it("shows this rep's sales, install status, proof, calls, forms and notifications in their own zone", async () => {
    const text = await load(createFakeAskDb(seed()).db);

    expect(text).toContain('Maria Johnson, 1412 Oak St, Des Moines IA');
    expect(text).toContain('sold Thu, Sep 24');
    expect(text).toContain('logged Thu, Sep 24 8:10 PM');
    expect(text).toContain('install: installs Tue, Sep 29');
    expect(text).toContain('carrier report: pending install');
    expect(text).toMatch(/Maria Johnson[^\n]*order # attached; screenshot not attached/);
    expect(text).toMatch(/Tom Baker[^\n]*install: cancelled[^\n]*order # not attached; screenshot attached/);
    expect(text).toContain('- Monday Team Call: Mon, Sep 28 7:00 PM');
    expect(text).not.toContain('Managers Only Sync');
    expect(text).not.toContain('Old Call');
    expect(text).toContain('Expedite order (for Maria Johnson, reason: Install too far out): open');
    expect(text).toContain('Payroll dispute: open');
    expect(text).toContain('Install tomorrow');
  });

  it('ranks the rep on the Board with the names just above them', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    // Sunday starts a new Board week, so these Thursday/Friday sales are this month's only.
    expect(text).toContain('- This week: not on the Board yet (no approved sales).');
    expect(text).toContain('- This month: #2 of 3 with 1 sale, 10 points; just above: #1 Jordan Price (1 sale, 30 points); just below: #3 Sam Lee (1 sale, 5 points).');
  });

  it("never shows another rep's sales, carrier orders, forms or notifications", async () => {
    const text = await load(createFakeAskDb(seed()).db);
    expect(text).not.toContain('Secret Neighbor');
    expect(text).not.toContain('Hidden Ln');
    expect(text).not.toContain('Third Party');
  });

  it('never carries a pay, commission, value or dollar field, even when the docs have them', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    expect(text).not.toContain('$');
    for (const value of MONEY) expect(text).not.toContain(value);
    expect(text).not.toMatch(/commission|payout|estimated ?pay|expected ?pay|you earn \d/i);
    // The dollar figure in free text is cut; the rest of the line stays.
    expect(text).toContain('Customer backed out, [amount] chargeback');
  });

  it('redacts phone numbers and emails, and never reads the contact fields', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    expect(text).toContain('call [phone] or [email]');
    expect(text).not.toContain('515-555-0142');
    expect(text).not.toContain('515-555-0199');
    expect(text).not.toContain('example.com');
  });

  it('leaves out a section whose read fails and keeps the rest', async () => {
    const text = await load(createFakeAskDb(seed(), ['scheduledCalls']).db);
    expect(text).not.toContain('Monday Team Call');
    expect(text).not.toMatch(/team calls/i);
    expect(text).toContain('Maria Johnson');
    expect(warn).toHaveBeenCalledWith('[ask-3c] live section failed', 'calls', expect.any(String));
  });

  it('leaves out a section that misses the time budget', async () => {
    const { db } = createFakeAskDb(seed());
    const slow = {
      ...db,
      collection: (name: string) =>
        name === 'scheduledCalls' ? { get: () => Promise.withResolvers<never>().promise } : db.collection(name),
    };
    const started = Date.now();
    const text = await load(slow, 100);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(text).not.toContain('Monday Team Call');
    expect(text).toContain('Maria Johnson');
  });

  it("still loads when the rep's profile can't be read, in Central time", async () => {
    const text = await load(createFakeAskDb(seed(), ['users']).db);
    expect(text).toContain('Maria Johnson');
    expect(text).toContain('Monday Team Call: Mon, Sep 28 7:00 PM');
  });
});
