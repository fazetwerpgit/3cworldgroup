import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory Firestore: just the calls the route makes.
const db = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const store = new Map<string, Data>();
  const commits: string[][] = [];
  let autoId = 0;

  const snap = (path: string) => ({
    id: path.split('/')[1],
    exists: store.has(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
  });
  const query = (name: string, filter: (data: Data) => boolean, max = Infinity) => ({
    limit: (n: number) => query(name, filter, n),
    get: async () => ({
      docs: [...store.entries()]
        .filter(([path, data]) => path.startsWith(`${name}/`) && filter(data))
        .slice(0, max)
        .map(([path]) => snap(path)),
    }),
  });
  const docRef = (name: string, id: string) => {
    const path = `${name}/${id}`;
    return {
      id,
      path,
      update: async (patch: Data) => {
        const next = { ...store.get(path) };
        for (const [key, value] of Object.entries(patch)) {
          const [head, tail] = key.split('.');
          if (tail) next[head] = { ...(next[head] as Data), [tail]: value };
          else next[key] = value;
        }
        store.set(path, next);
      },
    };
  };

  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, op: string, value: unknown) =>
        query(name, (data) =>
          op === '==' ? data[field] === value : typeof data[field] === 'string' && (data[field] as string) > (value as string)
        ),
      add: async (data: Data) => {
        const ref = docRef(name, `auto-${++autoId}`);
        store.set(ref.path, data);
        return ref;
      },
    }),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((ref) => snap(ref.path)),
    batch: () => {
      const ops: Array<() => void> = [];
      const paths: string[] = [];
      return {
        update: (ref: { path: string }, data: Data) => {
          paths.push(ref.path);
          ops.push(() => store.set(ref.path, { ...store.get(ref.path), ...data }));
        },
        set: (ref: { path: string }, data: Data, options?: { merge?: boolean }) => {
          paths.push(ref.path);
          ops.push(() => store.set(ref.path, options?.merge ? { ...store.get(ref.path), ...data } : data));
        },
        commit: async () => {
          ops.forEach((op) => op());
          commits.push(paths);
        },
      };
    },
  };
  return { store, commits, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));

import { POST } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { decryptField, encryptField } from '@/lib/security/fieldEncryption';

const gate = vi.mocked(requireVerifiedManagement);
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true } as const;
const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false } as const;
const OPS = { ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false, isOwner: false } as const;

// FAKE people only. Columns: name, phone, email, address, state name, shirt,
// manager, 18+, SSN, DL#.
const SHEET: unknown[][] = [
  ['Alex Rivera', '(319) 555-0100', 'alex@example.com', '2172 North Oak Ct\nCoralville, IA 52241\nUS', 'Iowa', 'XXL', 'Pat Manager', 'Yes', '123456789', 'D1234567'],
  ['William Teasdale', '(319) 555-0111', 'w.personal@example.com', '9 Elm St\nIowa City, IA 52240\nUS', 'Iowa', 'L', 'Pat Manager', 'Yes', '987654321', 'T9876543'],
  ['Casey Moss', '(319) 555-0122', 'casey@example.com', 'Somewhere over the rainbow', 'Iowa', 'M', '', 'Yes', '111223333', 'C1112233'],
  ['Dana Filled', '(319) 555-0133', 'dana@example.com', '1 Main St\nDes Moines, IA 50309\nUS', 'Iowa', 'S', '', 'Yes', '222334444', 'F5556677'],
  ['Nobody Portal', '(319) 555-0144', 'nobody@example.com', '2 Main St\nAmes, IA 50010', 'Iowa', 'M', '', 'Yes', '333445555', 'N1234567'],
  ['Evan Gone', '(319) 555-0155', 'evan@example.com', '3 Main St\nAmes, IA 50010', 'Iowa', 'M', '', 'Yes', '444556666', 'E1234567'],
  ['Gina Twice', '(319) 555-0166', 'gina1@example.com', '4 Main St\nAmes, IA 50010', 'Iowa', 'M', '', 'Yes', '555667777', 'G1234567'],
  ['Gina Twice', '(319) 555-0177', 'gina2@example.com', '5 Main St\nAmes, IA 50010', 'Iowa', 'M', '', 'Yes', '666778888', 'G7654321'],
];

// Every sheet value that must never come back in a response or an audit row.
const SECRETS = SHEET.flatMap((row) => [row[1], row[3], row[8], row[9]] as string[]).concat([
  '555-0100',
  '5550100',
  'North Oak',
  'Coralville',
  '52241',
  '6789',
]);

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Employees');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function post(mode: string, rows: unknown[][] = SHEET) {
  const form = new FormData();
  form.set('mode', mode);
  form.set(
    'file',
    new File([new Uint8Array(await xlsx(rows))], 'employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  return POST(new NextRequest('http://localhost/api/portal/admin/employee-import', { method: 'POST', body: form }));
}

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

type PersonView = { name: string; willFill: string[]; keptExisting: string[]; issues: string[] };
const person = (json: { people: PersonView[] }, name: string) => json.people.find((p) => p.name === name);

beforeEach(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  gate.mockReset();
  gate.mockResolvedValue(OWNER);
  db.store.clear();
  db.commits.length = 0;

  const user = (displayName: string, email: string, extra: Record<string, unknown> = {}) => ({
    displayName,
    email,
    status: 'active',
    ...extra,
  });
  db.store.set('users/u-alex', user('Alex Rivera', 'ALEX@Example.com'));
  db.store.set('users/u-wil', user('Wil Teasdale', 'wil@3cworldgroup.example'));
  db.store.set('users/u-casey', user('Casey Moss', 'casey.work@example.com'));
  db.store.set(
    'users/u-dana',
    user('Dana Filled', 'dana@example.com', {
      phone: '(515) 555-0199',
      address: '77 Portal Rd',
      city: 'Ankeny',
      state: 'IA',
      zip: '50021',
      shirtSize: 'M',
    })
  );
  db.store.set('users/u-evan', user('Evan Gone', 'evan@example.com', { status: 'inactive' }));
  db.store.set('users/u-gina', user('Gina Twice', 'gina.portal@example.com'));
  db.store.set('users/u-frank', user('Frank Absent', 'frank@example.com'));

  db.store.set('userSensitive/u-dana', { ssnEncrypted: encryptField('999880000'), ssnLast4: '0000' });
  // Someone already on file: what the key check decrypts.
  db.store.set('userSensitive/u-seed', { ssnEncrypted: encryptField('555443333'), ssnLast4: '3333' });
});

describe('employee import owner gate', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', ADMIN, 403],
    ['operations', OPS, 403],
  ])('refuses %s without reading the file', async (_who, result, status) => {
    gate.mockResolvedValue(result as never);
    const before = structuredClone([...db.store.entries()]);
    const response = await post('apply');
    expect(response.status).toBe(status);
    expect(db.commits).toEqual([]);
    expect([...db.store.entries()]).toEqual(before);
  });
});

describe('preview', () => {
  it('reports per person what would fill, and never echoes a value or writes', async () => {
    const before = structuredClone([...db.store.entries()]);
    const response = await post('preview');
    expect(response.status).toBe(200);
    const json = await response.json();

    expectNoSecrets(json);
    expect(db.commits).toEqual([]);
    expect([...db.store.entries()]).toEqual(before);

    expect(json.sheetRows).toBe(8);
    expect(json.matched).toBe(4);
    // Nobody Portal and the inactive Evan. Gina's two rows are hers (she is skipped).
    expect(json.unmatchedRows).toBe(2);
    expect(person(json, 'Alex Rivera')).toEqual({
      name: 'Alex Rivera',
      willFill: ['phone', 'address', 'shirt', 'ssn', 'dl'],
      keptExisting: [],
      issues: [],
    });
    expect(json.skipped).toEqual([
      { name: 'Frank Absent', reason: 'Not in the sheet' },
      { name: 'Gina Twice', reason: 'Matches 2 rows in the sheet' },
    ]);
    expect(person(json, 'Evan Gone')).toBeUndefined();
  });

  it('matches Wil Teasdale to the sheet row for William Teasdale', async () => {
    const json = await (await post('preview')).json();
    expect(person(json, 'Wil Teasdale')?.willFill).toEqual(['phone', 'address', 'shirt', 'ssn', 'dl']);
  });

  it('reports an address it cannot read and fills the rest', async () => {
    const json = await (await post('preview')).json();
    expect(person(json, 'Casey Moss')).toEqual({
      name: 'Casey Moss',
      willFill: ['phone', 'shirt', 'ssn', 'dl'],
      keptExisting: [],
      issues: ['Address could not be read (skipped)'],
    });
  });

  it('keeps what the portal already has and reports a different SSN', async () => {
    const json = await (await post('preview')).json();
    expect(person(json, 'Dana Filled')).toEqual({
      name: 'Dana Filled',
      willFill: ['dl'],
      keptExisting: ['phone', 'address', 'shirt', 'ssn'],
      issues: ['SSN on file differs (kept portal)'],
    });
  });

  it('rejects a file that is not an xlsx', async () => {
    const form = new FormData();
    form.set('mode', 'preview');
    form.set('file', new File(['name,phone\n'], 'employees.csv', { type: 'text/csv' }));
    const response = await POST(
      new NextRequest('http://localhost/api/portal/admin/employee-import', { method: 'POST', body: form })
    );
    expect(response.status).toBe(400);
  });
});

describe('apply', () => {
  it('writes only empty fields, encrypted so they decrypt back, and audits counts only', async () => {
    const response = await post('apply');
    expect(response.status).toBe(200);
    const json = await response.json();
    expectNoSecrets(json);
    expect(json.updated).toBe(4);
    expect(json.failed).toBe(0);

    const alex = db.store.get('users/u-alex')!;
    expect(alex).toMatchObject({
      phone: '(319) 555-0100',
      address: '2172 North Oak Ct',
      city: 'Coralville',
      state: 'IA',
      zip: '52241',
      shirtSize: '2XL',
    });
    expect(alex.updatedAt).toBeInstanceOf(Date);
    expect(alex).not.toHaveProperty('manager');
    const alexSensitive = db.store.get('userSensitive/u-alex')!;
    expect(decryptField(alexSensitive.ssnEncrypted as string)).toBe('123456789');
    expect(decryptField(alexSensitive.dlNumberEncrypted as string)).toBe('D1234567');
    expect(alexSensitive).toMatchObject({ ssnLast4: '6789', dlLast4: '4567', updatedBy: 'import:owner owner-1' });

    expect(db.store.get('users/u-wil')).toMatchObject({ shirtSize: 'L', city: 'Iowa City' });
    expect(db.store.get('users/u-casey')).not.toHaveProperty('address');

    // Dana: portal values kept, SSN untouched, only the DL# added.
    const dana = db.store.get('users/u-dana')!;
    expect(dana).toMatchObject({ phone: '(515) 555-0199', address: '77 Portal Rd', shirtSize: 'M' });
    const danaSensitive = db.store.get('userSensitive/u-dana')!;
    expect(decryptField(danaSensitive.ssnEncrypted as string)).toBe('999880000');
    expect(danaSensitive.ssnLast4).toBe('0000');
    expect(decryptField(danaSensitive.dlNumberEncrypted as string)).toBe('F5556677');

    // Inactive, unmatched and ambiguous people are never written.
    expect(db.store.get('users/u-evan')).not.toHaveProperty('phone');
    expect(db.store.has('userSensitive/u-evan')).toBe(false);
    expect(db.store.get('users/u-gina')).not.toHaveProperty('phone');
    expect(db.store.get('users/u-frank')).not.toHaveProperty('phone');

    const audits = [...db.store.entries()].filter(([path]) => path.startsWith('adminImports/'));
    expect(audits).toHaveLength(1);
    const [, audit] = audits[0];
    expectNoSecrets(audit);
    expect(audit).toMatchObject({
      by: 'owner-1',
      status: 'done',
      counts: { sheetRows: 8, matched: 4, updated: 4, failed: 0, filled: { phone: 3, address: 2, shirt: 3, ssn: 3, dl: 4 } },
    });
  });

  it('refuses to write when the SSNs on file were encrypted with another key', async () => {
    const serverKey = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    db.store.set('userSensitive/u-seed', { ssnEncrypted: encryptField('555443333'), ssnLast4: '3333' });
    db.store.set('userSensitive/u-dana', { ssnEncrypted: encryptField('999880000'), ssnLast4: '0000' });
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = serverKey;
    const before = structuredClone([...db.store.entries()]);

    const response = await post('apply');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Encryption key check failed' });
    expect(db.commits).toEqual([]);
    expect([...db.store.entries()]).toEqual(before);
  });

  it('refuses to write when no SSN is on file to check the key against', async () => {
    db.store.delete('userSensitive/u-seed');
    db.store.delete('userSensitive/u-dana');
    const response = await post('apply');
    expect(response.status).toBe(500);
    expect(db.commits).toEqual([]);
  });
});
