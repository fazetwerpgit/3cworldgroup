import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAskDb } from './fakeAskDb';
import { addressArea, aliasTeammates, customerAlias, loadRepSnapshot, orderTail, rankBoard, withoutNames, type BoardSale } from './liveData';

// loadRepSnapshot: only the asking rep's documents, never a pay or money
// field, never a customer's name, street, phone or email, never a teammate's
// name, and a failing or slow section left out
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

    expect(text).toContain('- Customer A, Des Moines; plan T-Fiber 1 Gig');
    expect(text).toContain('sold Thu, Sep 24');
    expect(text).toContain('logged Thu, Sep 24 8:10 PM');
    expect(text).toContain('install: installs Tue, Sep 29');
    expect(text).toContain('carrier report: pending install');
    expect(text).toMatch(/Customer A, Des Moines[^\n]*order # attached \(ending DER1\); screenshot not attached/);
    expect(text).toMatch(/Customer B, Ankeny[^\n]*install: cancelled[^\n]*order # not attached; screenshot attached/);
    expect(text).toContain('- Monday Team Call: Mon, Sep 28 7:00 PM');
    expect(text).not.toContain('Managers Only Sync');
    expect(text).not.toContain('Old Call');
    expect(text).toContain('Expedite order (reason: Install too far out): open');
    expect(text).toContain('Payroll dispute: open');
    expect(text).toMatch(/: Install reminder \(unread\)$/m);
  });

  it('shows managers-only calls to a director, like the Calls page', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.users.dir1 = { displayName: 'Dee', status: 'active', fieldRole: 'director' };
    const text = await loadRepSnapshot(createFakeAskDb(data).db as unknown as Firestore, 'dir1', NOW);
    expect(text).toContain('Managers Only Sync');
  });

  it('ranks the rep on the Board with the teammates just above and below as Teammate N', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    // Sunday starts a new Board week, so these Thursday/Friday sales are this month's only.
    expect(text).toContain('- This week (Sun, Sep 27 to Sat, Oct 3): nobody on the Board yet.');
    expect(text).toContain('- This month (Tue, Sep 1 to Wed, Sep 30): #2 of 3 with 1 sale, 10 points; just above: #1 Teammate 1 (1 sale, 30 points); just below: #3 Teammate 2 (1 sale, 5 points).');
    expect(text).not.toMatch(/Jordan|Price|Sam Lee|Dana/);
  });

  it('gives a demo account teammates as Teammate N too, never their names (App Review)', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.users.r1 = { ...data.users.r1, demoAccount: true };
    const text = await load(createFakeAskDb(data).db);
    expect(text).toContain('#2 of 3 with 1 sale, 10 points; just above: #1 Teammate 1 (1 sale, 30 points); just below: #3 Teammate 2 (1 sale, 5 points).');
    expect(text).not.toMatch(/Jordan|Price|Sam Lee|\br2\b|\br3\b/);
    expect(text).toContain('- Customer A, Des Moines;');
  });

  it('breaks a points tie the way the Board does: by name, not by who sold last', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    // Sam Lee sold after Dana Rep; tied on points, Dana still comes first.
    data.sales.third.totalPoints = 10;
    const text = await load(createFakeAskDb(data).db);
    expect(text).toContain('#2 of 3 with 1 sale, 10 points; just above: #1 Teammate 1 (1 sale, 30 points); just below: #3 Teammate 2 (1 sale, 10 points).');
  });

  it('reads the newest notifications, however many older ones come first by id', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    for (let i = 0; i < 45; i += 1) {
      data.notifications[`a${String(i).padStart(2, '0')}`] = { userId: 'r1', type: 'install_reminder', title: `Old note ${i}`, message: '', read: true, createdAt: noon('2026-09-01') };
    }
    data.notifications.z9 = { userId: 'r1', type: 'install_overdue', title: 'Newest install news', message: '', read: false, createdAt: noon('2026-09-27') };
    const text = await load(createFakeAskDb(data).db);
    expect(text).toContain('Sun, Sep 27: Install overdue (unread)');
    expect(text).not.toContain('Newest install news');
  });

  it('gives someone who is not on the Board (an owner) everyone on it, not just the last row', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.users.owner1 = { displayName: 'Jeremy', status: 'active', role: 'owner' };
    const text = await loadRepSnapshot(createFakeAskDb(data).db as unknown as Firestore, 'owner1', NOW);
    expect(text).toContain('Everyone on it (3): #1 Teammate 1 (1 sale, 30 points); #2 Teammate 2 (1 sale, 10 points); #3 Teammate 3 (1 sale, 5 points)');
    expect(text).not.toMatch(/Jordan|Sam Lee|Dana/);
  });

  it('reads the Board once a minute, however many questions come in', async () => {
    const { db } = createFakeAskDb(seed());
    let boardReads = 0;
    const counting = {
      ...db,
      collection: (name: string) => {
        const ref = db.collection(name) as unknown as { where: (...args: unknown[]) => unknown };
        return name === 'sales'
          ? {
              ...ref,
              where: (field: string, ...rest: unknown[]) => {
                if (field === 'saleDate') boardReads += 1;
                return ref.where(field, ...rest);
              },
            }
          : ref;
      },
    };
    await loadRepSnapshot(counting as unknown as Firestore, 'r1', NOW);
    await loadRepSnapshot(counting as unknown as Firestore, 'r2', new Date(NOW.getTime() + 30_000));
    expect(boardReads).toBe(1);
    await loadRepSnapshot(counting as unknown as Firestore, 'r1', new Date(NOW.getTime() + 61_000));
    expect(boardReads).toBe(2);
  });

  it('never shows a notification about someone else, even one addressed to this rep', async () => {
    const data = seed();
    const notes = data.notifications as Record<string, Record<string, unknown>>;
    notes.p1 = { userId: 'r1', type: 'sale_pending', title: 'New Sale Needs Approval', message: 'Jamie Stall submitted a new sale for review.', read: false, createdAt: noon('2026-09-27') };
    notes.a1 = { userId: 'r1', type: 'alert_task', title: 'Jamie Stall has stalled in onboarding', message: 'Jamie Stall self-registered 5 days ago', read: false, createdAt: noon('2026-09-27') };
    notes.a2 = { userId: 'r1', type: 'announcement', title: 'Riley Quinn - You\'re Cleared!', message: 'Manager note: Riley talks too fast, watch the close', read: false, createdAt: noon('2026-09-27') };
    const text = await load(createFakeAskDb(data).db);
    for (const leak of ['Jamie Stall', 'self-registered', 'Riley', 'talks too fast', 'Cleared']) expect(text).not.toContain(leak);
    expect(text).toContain('Install reminder');
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
    expect(text).not.toMatch(/commission|payout|estimated ?pay|expected ?pay|you earn/i);
    // A reason that touches pay is replaced whole, not half-redacted.
    expect(text).not.toMatch(/chargeback/i);
    expect(text).toMatch(/Customer B, Ankeny[^\n]*in the portal: cancelled \(reason on file, ask Jeremy or Jacob\)/);
    expect(text).toMatch(/: Install reminder( \(unread\))?$/m);
  });

  it('sends only the kind of a notification, never its text (pay, money or names)', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.notifications = {
      m1: { userId: 'r1', type: 'install_date_changed', title: 'Install date changed', message: 'Refund of USD 150 to the customer', read: false, createdAt: noon('2026-09-26') },
      m2: { userId: 'r1', type: 'carrier_order_issue', title: 'Install missed', message: 'Customer said 150$ was too much', read: false, createdAt: noon('2026-09-25') },
      m3: { userId: 'r1', type: 'sale_rejected', title: 'Sale rejected', message: 'Wrong rate on this one', read: false, createdAt: noon('2026-09-24') },
      m4: { userId: 'r1', type: 'install_reminder', title: 'Bonus earned', message: 'Nice work', read: false, createdAt: noon('2026-09-23') },
    };
    const text = await load(createFakeAskDb(data).db);
    for (const leak of ['USD', '150', 'too much', 'Wrong rate', 'Bonus', 'Nice work']) expect(text).not.toContain(leak);
    expect(text).toMatch(/: Install date changed( \(unread\))?$/m);
    expect(text).toMatch(/: Carrier flagged an order( \(unread\))?$/m);
    expect(text).toMatch(/: Sale rejected( \(unread\))?$/m);
    expect(text).toMatch(/: Install reminder( \(unread\))?$/m);
  });

  it('never sends a phone number, email or the address notes, and never reads the contact fields', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    expect(text).not.toContain('gate code');
    expect(text).not.toContain('515-555-0142');
    expect(text).not.toContain('515-555-0199');
    expect(text).not.toContain('example.com');
  });

  it('leaves out a section whose read fails and keeps the rest', async () => {
    const text = await load(createFakeAskDb(seed(), ['scheduledCalls']).db);
    expect(text).not.toContain('Monday Team Call');
    expect(text).not.toMatch(/team calls/i);
    expect(text).toContain('Customer A, Des Moines');
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
    expect(text).toContain('Customer A, Des Moines');
  });

  it("still loads when the rep's profile can't be read, in Central time", async () => {
    const text = await load(createFakeAskDb(seed(), ['users']).db);
    expect(text).toContain('Customer A, Des Moines');
    expect(text).toContain('Monday Team Call: Mon, Sep 28 7:00 PM');
  });
});

describe('loadRepSnapshot and the carrier report stamp (Noah, 2026-10-10)', () => {
  // Thu Oct 1, 3 PM Central: Maria's Tue Sep 29 install is still pending.
  const OCT1 = new Date('2026-10-01T20:00:00.000Z');
  const withStamp = (lastReportAsOf: string) => ({ ...seed(), config: { fiberReportStatus: { lastReportAsOf } } });

  it('says the install day passed and waits on the carrier while the report predates it', async () => {
    const text = await loadRepSnapshot(createFakeAskDb(withStamp('2026-09-28')).db as unknown as Firestore, 'r1', OCT1);
    expect(text).toMatch(/Customer A[^\n]*install: install day \(Tue, Sep 29\) passed, waiting on the carrier report/);
    expect(text).not.toMatch(/Customer A[^\n]*install overdue/);
  });

  it('calls it overdue once the report covers the day', async () => {
    const text = await loadRepSnapshot(createFakeAskDb(withStamp('2026-09-30')).db as unknown as Firestore, 'r1', OCT1);
    expect(text).toMatch(/Customer A[^\n]*install: install overdue/);
  });
});

describe('rankBoard — demo account sales', () => {
  const sale = (repId: string, name: string, points: number, demo = false): BoardSale => ({ repId, name, points, at: 100, demo });
  const sales = [sale('r1', 'Real One', 5), sale('demo', 'App Review', 50, true), sale('r2', 'Real Two', 3)];

  it("leaves a demo account's sales off a real rep's Board", () => {
    const [week] = rankBoard(sales, [0], 'r1');
    expect(week.map((row) => row.id)).toEqual(['r1', 'r2']);
  });

  it('keeps the demo account on its own Board', () => {
    const [week] = rankBoard(sales, [0], 'demo');
    expect(week.map((row) => row.id)).toEqual(['demo', 'r1', 'r2']);
  });
});

describe('loadRepSnapshot — demo account on the shared Board cache', () => {
  it('a demo viewer first does not put its sale on a real viewer’s Board second', async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.users.demo = { status: 'active', fieldRole: 'entry_rep', demoAccount: true };
    data.sales.demoSale = {
      salesRepId: 'demo',
      salesRepName: 'App Review',
      status: 'approved',
      saleDate: noon('2026-09-26'),
      createdAt: noon('2026-09-26'),
      totalPoints: 99,
      demoAccount: true,
    };
    const { db } = createFakeAskDb(data);

    const demoText = await loadRepSnapshot(db as unknown as Firestore, 'demo', NOW);
    const realText = await loadRepSnapshot(db as unknown as Firestore, 'r1', NOW);

    expect(demoText).toContain('#1 of 4 with 1 sale, 99 points');
    expect(realText).toContain('#2 of 3 with 1 sale, 10 points');
    expect(realText).not.toContain('App Review');
  });
});

describe('what Ask 3C may say about people (owner rule, Oct 18 2026)', () => {
  it('names a sale by an alias and its city, never the customer, street, phone or email', async () => {
    const text = await load(createFakeAskDb(seed()).db);
    for (const leak of ['Maria', 'Johnson', 'Tom Baker', 'Baker', 'Oak St', '1412', 'Elm Ave', '88 Elm', '515-555', 'example.com', 'TMO-ORDER-1', 'Dana Rep', 'Jordan', 'Sam Lee']) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("takes the sale's customer name and any street out of a reason", async () => {
    const data: Record<string, Record<string, Record<string, unknown>>> = seed();
    data.sales.s2.cancelReason = 'Tom moved to 12 Cedar Street, Baker family said no';
    const text = await load(createFakeAskDb(data).db);
    expect(text).toContain('in the portal: cancelled (the customer moved to [address], the customer family said no)');
    expect(text).not.toMatch(/Tom|Baker|Cedar/);
  });

  it('aliases customers A, B, ... and teammates 1, 2, ... consistently', () => {
    expect([0, 1, 25, 26].map(customerAlias)).toEqual(['Customer A', 'Customer B', 'Customer Z', 'Customer 27']);
    const row = (id: string, name: string) => ({ id, name, sales: 1, points: 1 });
    const out = aliasTeammates([[row('a', 'Ann'), row('me', 'Me')], [row('b', 'Bo'), row('a', 'Ann')]], 'me');
    expect(out.map((rows) => rows.map((r) => r.name))).toEqual([['Teammate 1', 'Me'], ['Teammate 2', 'Teammate 1']]);
  });

  it('keeps only the city (or ZIP) of an address, and only the last 4 of an order number', () => {
    expect(addressArea('4812 Larkspur Ln, Austin, TX 78745')).toBe('Austin');
    expect(addressArea('1412 Oak St, Des Moines IA (gate code 1234)')).toBe('Des Moines');
    expect(addressArea('4812 Larkspur Ln, TX 78745')).toBe('78745');
    expect(addressArea('4812 Larkspur Ln Austin TX')).toBe('');
    expect(addressArea('')).toBe('');
    expect(orderTail('TF-88412907')).toBe('2907');
    expect(orderTail('(512) 555-0142')).toBe('0142');
    expect(orderTail('12')).toBe('');
    expect(withoutNames('Maria Johnson called; maria said ok', ['Maria Johnson'])).toBe('the customer called; the customer said ok');
  });
});
