import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory Firestore: just the calls the route makes.
const db = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const store = new Map<string, Data>();
  const state = { failCommit: false };
  let autoId = 0;

  const snap = (path: string) => ({
    id: path.split('/')[1],
    exists: store.has(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
  });

  const adminDb = {
    collection: (name: string) => ({
      doc: (id = `auto-${++autoId}`) => ({ id, path: `${name}/${id}` }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path]) => snap(path)),
        }),
      }),
    }),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((ref) => snap(ref.path)),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: { path: string }, data: Data) => {
          ops.push(() => store.set(ref.path, data));
        },
        commit: async () => {
          if (state.failCommit) throw new Error('unavailable');
          ops.forEach((op) => op());
        },
      };
    },
  };
  return { store, state, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { encryptField } from '@/lib/security/fieldEncryption';

const gate = vi.mocked(requireVerifiedManagement);
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true } as const;
const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false } as const;
const OPS = { ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false, isOwner: false } as const;

const HEADER = [
  'Name',
  'Phone',
  'Email',
  'Street',
  'City',
  'State',
  'ZIP',
  'Shirt size',
  'Role',
  'Hire date',
  'SSN',
  "Driver's license #",
  'Background consent',
];

const exportRequest = () => GET(new NextRequest('http://localhost/api/portal/admin/employee-export'));

async function readSheet(response: Response): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const rows: string[][] = [];
  workbook.worksheets[0].eachRow({ includeEmpty: true }, (row) => {
    rows.push(HEADER.map((_, index) => String(row.getCell(index + 1).value ?? '')));
  });
  return rows;
}

const auditRows = (collection: string) =>
  [...db.store.entries()].filter(([path]) => path.startsWith(`${collection}/`)).map(([, data]) => data);

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  gate.mockReset();
  gate.mockResolvedValue(OWNER);
  db.store.clear();
  db.state.failCommit = false;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  // FAKE people only.
  db.store.set('users/u-alex', {
    displayName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '(319) 555-0100',
    address: '2172 North Oak Ct',
    city: 'Coralville',
    state: 'IA',
    zip: '52241',
    shirtSize: 'XL',
    fieldRole: 'ae_tier_1',
    hireDate: new Date('2026-03-02T17:00:00Z'),
    status: 'active',
  });
  db.store.set('users/u-blair', {
    displayName: 'Blair Stone',
    email: 'blair@example.com',
    fieldRole: 'ibo_level_2',
    status: 'active',
  });
  db.store.set('users/u-casey', { displayName: 'Casey Moss', email: 'casey@example.com', status: 'active' });
  db.store.set('users/u-pending', { displayName: 'Aaron Pending', email: 'p@example.com', status: 'pending' });

  db.store.set('userSensitive/u-alex', {
    ssnEncrypted: encryptField('123456789'),
    ssnLast4: '6789',
    dlNumberEncrypted: encryptField('D1234567'),
    dlLast4: '4567',
    backgroundCheckAuth: true,
  });
  db.store.set('userSensitive/u-casey', {
    ssnEncrypted: 'not-a-real-ciphertext',
    dlNumberEncrypted: encryptField('C7654321'),
    backgroundCheckAuth: false,
  });
  db.store.set('userSensitive/u-pending', { ssnEncrypted: encryptField('987654321') });
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('employee export owner gate', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', ADMIN, 403],
    ['operations', OPS, 403],
  ])('refuses %s with no file and no audit rows', async (_who, result, status) => {
    gate.mockResolvedValue(result as never);
    const response = await exportRequest();
    expect(response.status).toBe(status);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(auditRows('sensitiveAccessLog')).toEqual([]);
    expect(auditRows('adminExports')).toEqual([]);
  });
});

describe('employee export', () => {
  it('sends active users only, sorted by name, with full SSN and DL# and no caching', async () => {
    const response = await exportRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="3C-employee-data-\d{4}-\d{2}-\d{2}\.xlsx"$/
    );

    const rows = await readSheet(response);
    expect(rows[0]).toEqual(HEADER);
    expect(rows.slice(1)).toEqual([
      [
        'Alex Rivera',
        '(319) 555-0100',
        'alex@example.com',
        '2172 North Oak Ct',
        'Coralville',
        'IA',
        '52241',
        'XL',
        'Account Executive Tier 1',
        '2026-03-02',
        '123-45-6789',
        'D1234567',
        'Yes',
      ],
      // No SSN on file: blank. IBO levels are never named.
      ['Blair Stone', '', 'blair@example.com', '', '', '', '', '', '', '', '', '', ''],
      // A record the key cannot read says so; the rest of the export goes on.
      ['Casey Moss', '', 'casey@example.com', '', '', '', '', '', '', '', 'unreadable', 'C7654321', 'No'],
    ]);
  });

  it('logs one access row per person whose SSN or DL# went out, plus a counts-only summary', async () => {
    const response = await exportRequest();
    expect(response.status).toBe(200);

    const access = auditRows('sensitiveAccessLog');
    expect(access.map((row) => row.targetUid).sort()).toEqual(['u-alex', 'u-casey']);
    for (const row of access) {
      expect(row).toMatchObject({ revealedBy: 'owner-1', revealedByName: 'Owner', kind: 'export' });
      expect(row.at).toBeInstanceOf(Date);
    }
    const summary = auditRows('adminExports');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ by: 'owner-1', count: 3, sensitiveCount: 2 });
    expect(JSON.stringify(summary)).not.toMatch(/6789|D1234567|C7654321|555-0100/);
  });

  it('sends no file when the audit cannot be written', async () => {
    db.state.failCommit = true;
    const response = await exportRequest();
    expect(response.status).toBe(500);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/123456789|6789|D1234567|C7654321/);
  });
});
