import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory Firestore + Storage: just the calls the onboarding-file routes make.
const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const store = new Map<string, Data>();
  const files = new Map<string, Buffer>();
  const state = { failCommit: false, failAdd: false, brokenFiles: new Set<string>() };
  let autoId = 0;

  const snap = (path: string) => ({
    id: path.split('/')[1],
    exists: store.has(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined),
    get: (field: string) => store.get(path)?.[field],
  });
  const ref = (name: string, id: string) => {
    const path = `${name}/${id}`;
    return {
      id,
      path,
      get: async () => snap(path),
      set: async (data: Data, options?: { merge?: boolean }) => {
        store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
      },
    };
  };
  const adminDb = {
    collection: (name: string) => ({
      doc: (id = `auto-${++autoId}`) => ref(name, id),
      add: async (data: Data) => {
        if (state.failAdd) throw new Error('unavailable');
        store.set(`${name}/auto-${++autoId}`, data);
      },
    }),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snap(r.path)),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Data) => {
          ops.push(() => store.set(r.path, data));
        },
        commit: async () => {
          if (state.failCommit) throw new Error('unavailable');
          ops.forEach((op) => op());
        },
      };
    },
  };
  const storageFile = (name: string) => ({
    name,
    metadata: { contentType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' },
    download: async () => {
      if (state.brokenFiles.has(name) || !files.has(name)) throw new Error('No such object');
      return [files.get(name)!] as [Buffer];
    },
    save: async (data: Buffer) => {
      files.set(name, data);
    },
    getSignedUrl: async () => [`https://signed.example/${name}`],
  });
  const bucket = {
    file: storageFile,
    getFiles: async ({ prefix }: { prefix: string }) => [
      [...files.keys()].filter((name) => name.startsWith(prefix)).map(storageFile),
    ],
  };
  return { store, files, state, adminDb, bucket };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: fake.adminDb,
  adminStorage: { bucket: () => fake.bucket },
  getOnboardingBucket: () => fake.bucket,
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
const getCompletedPdf = vi.hoisted(() => vi.fn());
vi.mock('@/lib/esign/provider', () => ({ getEsignProvider: () => ({ getCompletedPdf }) }));

import { GET as summaryGET } from './route';
import { GET as pdfGET } from './signed-pdf/route';
import { GET as filesGET } from './files/route';
import { GET as downloadGET } from './download/route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { encryptField } from '@/lib/security/fieldEncryption';

const gate = vi.mocked(requireVerifiedManagement);
const OWNER = { ok: true, uid: 'owner1', name: 'Owner One', isAdmin: true, isOwner: true } as const;
const OTHER_OWNER = { ok: true, uid: 'owner2', name: 'Owner Two', isAdmin: true, isOwner: true } as const;
const ADMIN = { ok: true, uid: 'admin1', name: 'Admin', isAdmin: true, isOwner: false } as const;
const OPS = { ok: true, uid: 'ops1', name: 'Ops', isAdmin: false, isOwner: false } as const;
const REP_DENIED = { ok: false, error: 'Forbidden: management access required', status: 403 } as const;
const ANON = { ok: false, error: 'Missing authentication token', status: 401 } as const;

const base = 'http://localhost/api/portal/admin/onboarding-file';
const ctx = (uid: string) => ({ params: Promise.resolve({ uid }) });
const call = {
  summary: (uid = 'alex') => summaryGET(new NextRequest(`${base}/${uid}`), ctx(uid)),
  pdf: (uid = 'alex', itemId = 'w9') => pdfGET(new NextRequest(`${base}/${uid}/signed-pdf?itemId=${itemId}`), ctx(uid)),
  files: (uid = 'alex', itemId = 'dl_photos') =>
    filesGET(new NextRequest(`${base}/${uid}/files?itemId=${itemId}`), ctx(uid)),
  download: (uid = 'alex') => downloadGET(new NextRequest(`${base}/${uid}/download`), ctx(uid)),
};

const rows = (collection: string) =>
  [...fake.store.entries()].filter(([path]) => path.startsWith(`${collection}/`)).map(([, data]) => data);

async function unzip(response: Response): Promise<JSZip> {
  return JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'bucket.example');
  gate.mockReset();
  gate.mockResolvedValue(OWNER);
  getCompletedPdf.mockReset();
  getCompletedPdf.mockResolvedValue(Buffer.from('%PDF-live-contract'));
  fake.store.clear();
  fake.files.clear();
  fake.state.failCommit = false;
  fake.state.failAdd = false;
  fake.state.brokenFiles.clear();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  // FAKE people only.
  fake.store.set('users/alex', {
    displayName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '(319) 555-0100',
    address: '2172 North Oak Ct',
    city: 'Coralville',
    state: 'IA',
    zip: '52241',
    shirtSize: 'XL',
    fieldRole: 'ae_tier_1',
    isIBO: false,
    reportsToId: 'mgr',
    onboardingInviteId: 'inv1',
    hireDate: new Date('2026-03-02T17:00:00Z'),
    status: 'active',
  });
  fake.store.set('users/mgr', { displayName: 'Morgan Lead', status: 'active' });
  fake.store.set('candidateOnboarding/inv1', { submittedAt: new Date('2026-03-01T17:00:00Z') });
  fake.store.set('userSensitive/alex', {
    ssnEncrypted: encryptField('123456789'),
    ssnLast4: '6789',
    dlNumberEncrypted: encryptField('D1234567'),
    dlLast4: '4567',
    backgroundCheckAuth: true,
  });
  fake.store.set('userOnboarding/alex_w9', {
    userId: 'alex',
    itemId: 'w9',
    status: 'approved',
    completedPdfPath: 'esign-completed/alex/w9.pdf',
    prefill: { taxClassification: 'individual' },
  });
  fake.store.set('userOnboarding/alex_contract', {
    userId: 'alex',
    itemId: 'contract',
    status: 'approved',
    esignEnvelopeId: 'env-1',
  });
  fake.store.set('userOnboarding/alex_direct_deposit', {
    userId: 'alex',
    itemId: 'direct_deposit',
    status: 'submitted',
  });
  fake.store.set('userOnboarding/alex_dl_photos', {
    userId: 'alex',
    itemId: 'dl_photos',
    status: 'approved',
    reference: 'onboarding/alex/dl_photos/',
  });
  fake.files.set('esign-completed/alex/w9.pdf', Buffer.from('%PDF-w9'));
  fake.files.set('onboarding/alex/dl_photos/front.jpg', Buffer.from('front-bytes'));
  fake.files.set('onboarding/alex/dl_photos/back.jpg', Buffer.from('back-bytes'));

  // An older rep: no onboarding records, no packet, no sensitive doc.
  fake.store.set('users/old', {
    displayName: 'Pat Older',
    email: 'pat@example.com',
    fieldRole: 'ae_tier_1',
    status: 'active',
  });
  // Another owner.
  fake.store.set('users/owner1', { displayName: 'Owner One', role: 'owner', status: 'active' });
  fake.store.set('userSensitive/owner1', { ssnEncrypted: encryptField('111223333') });
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
});

describe('owner gate on every onboarding-file route', () => {
  const routes = [
    ['summary', () => call.summary()],
    ['signed PDF', () => call.pdf()],
    ['files', () => call.files()],
    ['download', () => call.download()],
  ] as const;
  const callers = [
    ['anonymous', ANON, 401],
    ['a rep (including the person themself)', REP_DENIED, 403],
    ['management', REP_DENIED, 403],
    ['an admin', ADMIN, 403],
    ['operations', OPS, 403],
  ] as const;

  for (const [route, run] of routes) {
    it.each(callers)(`${route}: refuses %s with no data and no audit rows`, async (_who, result, status) => {
      gate.mockResolvedValue(result as never);
      const response = await run();
      expect(response.status).toBe(status);
      expect(response.headers.get('content-disposition')).toBeNull();
      const body = await response.json();
      expect(Object.keys(body)).toEqual(['error']);
      expect(rows('sensitiveAccessLog')).toEqual([]);
      expect(rows('adminAuditLog')).toEqual([]);
      expect(rows('adminExports')).toEqual([]);
    });
  }

  it("lets one owner open another owner's file, as the sensitive reveal route does", async () => {
    gate.mockResolvedValue(OTHER_OWNER);
    const summary = await call.summary('owner1');
    expect(summary.status).toBe(200);
    const download = await call.download('owner1');
    expect(download.status).toBe(200);
    expect(rows('sensitiveAccessLog')[0]).toMatchObject({
      targetUid: 'owner1',
      revealedBy: 'owner2',
      sensitiveFields: true,
    });
  });

  it('404s an unknown person or a malformed uid', async () => {
    expect((await call.summary('nobody')).status).toBe(404);
    expect((await call.download('nobody')).status).toBe(404);
    expect((await call.summary('bad..uid')).status).toBe(404);
    expect((await call.pdf('bad..uid')).status).toBe(404);
  });
});

describe('summary', () => {
  it('shows profile, packet answers and every item, and logs the view', async () => {
    const response = await call.summary();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body.profile).toMatchObject({
      name: 'Alex Rivera',
      phone: '(319) 555-0100',
      address: '2172 North Oak Ct',
      shirtSize: 'XL',
      manager: 'Morgan Lead',
      hireDate: '03/02/2026',
      packetSubmittedAt: '03/01/2026',
      backgroundConsent: 'Yes',
    });
    const byId = Object.fromEntries(body.items.map((item: { itemId: string }) => [item.itemId, item]));
    expect(byId.w9).toMatchObject({
      status: 'approved',
      hasSignedPdf: true,
      prefill: { taxClassification: 'individual' },
    });
    expect(byId.contract).toMatchObject({ hasSignedPdf: true, envelopeSent: true });
    expect(byId.direct_deposit).toMatchObject({ status: 'submitted', hasSignedPdf: false, envelopeSent: false });
    expect(byId.dl_photos).toMatchObject({ hasFiles: true });
    // Never a decrypted number.
    expect(JSON.stringify(body)).not.toMatch(/123456789|123-45|D1234567/);

    expect(rows('adminAuditLog')).toEqual([
      expect.objectContaining({
        action: 'onboardingFile.view',
        actorUid: 'owner1',
        targetUid: 'alex',
        targetName: 'Alex Rivera',
      }),
    ]);
  });

  it('shows an older rep with no onboarding records without errors', async () => {
    const response = await call.summary('old');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile).toMatchObject({
      name: 'Pat Older',
      address: '',
      manager: '',
      packetSubmittedAt: '',
      backgroundConsent: '',
    });
    for (const item of body.items) {
      expect(item).toMatchObject({ status: 'not_started', hasSignedPdf: false, hasFiles: false });
    }
  });
});

describe('signed PDF', () => {
  it('sends the stored PDF inline and logs the opening first', async () => {
    const response = await call.pdf('alex', 'w9');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-w9');
    expect(rows('sensitiveAccessLog')).toEqual([
      expect.objectContaining({
        targetUid: 'alex',
        itemId: 'w9',
        revealedBy: 'owner1',
        source: 'onboarding-file-signed-pdf',
      }),
    ]);
  });

  it('logs a non-sensitive document too', async () => {
    const response = await call.pdf('alex', 'contract');
    expect(response.status).toBe(200);
    expect(rows('sensitiveAccessLog')).toHaveLength(1);
  });

  it('withholds the PDF when the audit row cannot be written', async () => {
    fake.state.failAdd = true;
    const response = await call.pdf('alex', 'w9');
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('404s an unsigned or non e-sign item without logging', async () => {
    expect((await call.pdf('alex', 'direct_deposit')).status).toBe(404);
    expect((await call.pdf('alex', 'dl_photos')).status).toBe(404);
    expect((await call.pdf('old', 'w9')).status).toBe(404);
    expect(rows('sensitiveAccessLog')).toEqual([]);
  });
});

describe('files', () => {
  it('returns signed links and logs the opening', async () => {
    const response = await call.files('alex', 'dl_photos');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files.map((file: { name: string }) => file.name).sort()).toEqual(['back.jpg', 'front.jpg']);
    expect(rows('sensitiveAccessLog')).toEqual([
      expect.objectContaining({ targetUid: 'alex', itemId: 'dl_photos', source: 'onboarding-file-files' }),
    ]);
  });

  it('returns an empty list and no log row when nothing was uploaded', async () => {
    const response = await call.files('old', 'dl_photos');
    expect(response.status).toBe(200);
    expect((await response.json()).files).toEqual([]);
    expect(rows('sensitiveAccessLog')).toEqual([]);
  });

  it('withholds the links when the audit row cannot be written', async () => {
    fake.state.failAdd = true;
    const response = await call.files('alex', 'dl_photos');
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('signed.example');
  });
});

describe('download all files', () => {
  it('zips every signed PDF, every upload and the info sheet with clear names', async () => {
    const response = await call.download();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Rivera-Alex-onboarding-file.zip"');

    const zip = await unzip(response);
    expect(Object.keys(zip.files).sort()).toEqual([
      'Rivera-Alex-Contract-signed.pdf',
      'Rivera-Alex-Drivers-license-back.jpg',
      'Rivera-Alex-Drivers-license-front.jpg',
      'Rivera-Alex-W9-signed.pdf',
      'Rivera-Alex-info.xlsx',
    ]);
    expect(await zip.file('Rivera-Alex-W9-signed.pdf')!.async('string')).toBe('%PDF-w9');
    expect(await zip.file('Rivera-Alex-Contract-signed.pdf')!.async('string')).toBe('%PDF-live-contract');
    expect(await zip.file('Rivera-Alex-Drivers-license-front.jpg')!.async('string')).toBe('front-bytes');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await zip.file('Rivera-Alex-info.xlsx')!.async('arraybuffer'));
    const sheet = workbook.worksheets[0];
    const cells = (n: number) => (sheet.getRow(n).values as unknown[]).slice(1).map((v) => String(v ?? ''));
    expect(cells(1)[0]).toBe('Name');
    expect(cells(2)).toEqual([
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
    ]);
    expect(sheet.rowCount).toBe(2);
  });

  it('writes one access row and one export row, with no values', async () => {
    await call.download();
    expect(rows('sensitiveAccessLog')).toEqual([
      expect.objectContaining({
        targetUid: 'alex',
        revealedBy: 'owner1',
        revealedByName: 'Owner One',
        kind: 'export',
        source: 'onboarding-file-download',
        sensitiveFields: true,
      }),
    ]);
    expect(rows('sensitiveAccessLog')[0].itemIds).toEqual(['w9', 'dl_photos', 'contract']);
    expect(rows('adminExports')).toEqual([
      expect.objectContaining({
        kind: 'onboarding-file',
        by: 'owner1',
        targetUid: 'alex',
        fileCount: 5,
        missingCount: 0,
      }),
    ]);
    expect(JSON.stringify(rows('adminExports'))).not.toMatch(/6789|D1234567|555-0100|Rivera/);
  });

  it('skips a file it cannot read and lists it in a missing-files note', async () => {
    fake.state.brokenFiles.add('onboarding/alex/dl_photos/back.jpg');
    getCompletedPdf.mockRejectedValue(new Error('provider down'));
    const response = await call.download();
    expect(response.status).toBe(200);
    const zip = await unzip(response);
    expect(Object.keys(zip.files).sort()).toEqual([
      'Rivera-Alex-Drivers-license-front.jpg',
      'Rivera-Alex-W9-signed.pdf',
      'Rivera-Alex-info.xlsx',
      'Rivera-Alex-missing-files.txt',
    ]);
    const note = await zip.file('Rivera-Alex-missing-files.txt')!.async('string');
    expect(note).toContain('Contract: signed PDF could not be loaded');
    expect(note).toContain("Driver's License: a file could not be loaded");
    expect(rows('adminExports')[0]).toMatchObject({ missingCount: 2 });
  });

  it('gives an older rep just their info sheet', async () => {
    const response = await call.download('old');
    expect(response.status).toBe(200);
    const zip = await unzip(response);
    expect(Object.keys(zip.files)).toEqual(['Older-Pat-info.xlsx']);
    expect(rows('sensitiveAccessLog')[0]).toMatchObject({ targetUid: 'old', itemIds: [], sensitiveFields: false });
  });

  it('sends nothing when the audit cannot be written', async () => {
    fake.state.failCommit = true;
    const response = await call.download();
    expect(response.status).toBe(500);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/123456789|D1234567/);
  });
});
