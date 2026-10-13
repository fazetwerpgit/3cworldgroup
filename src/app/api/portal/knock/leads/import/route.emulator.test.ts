import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ATT_CSV, bigAttCsv, leadSeed } from '@/lib/knock/leadTestCsv';
import { writeLeadHouses, type LeadImportEvent } from '@/lib/knock/leadImportServer';
import type { HouseDoc } from '@/lib/knock/types';

// The import route against a real Firestore EMULATOR (batched creates, getAll, ALREADY_EXISTS).
// Skipped unless FIRESTORE_EMULATOR_HOST is set and the project is a demo- one, which can never
// reach a real Google project:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8591 GCLOUD_PROJECT=demo-portal-leads npx vitest run <this file>

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = process.env.GCLOUD_PROJECT ?? '';
if (host && !project.startsWith('demo-')) {
  throw new Error('Emulator tests need GCLOUD_PROJECT=demo-…');
}

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true })),
}));
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

import { POST } from './route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/knock/leads/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function last(res: Response): Promise<LeadImportEvent | undefined> {
  return (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LeadImportEvent)
    .at(-1);
}

describe.skipIf(!host)('lead import against the Firestore emulator', () => {
  let app: App;
  let db: Firestore;

  beforeEach(async () => {
    app ??= initializeApp({ projectId: project }, 'lead-import-emulator-test');
    db ??= getFirestore(app);
    holder.db = db;
    process.env.KNOCK_LEAD_IMPORT_LIVE = '1';
    await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
    const batch = db.batch();
    for (const [name, docs] of Object.entries(leadSeed())) {
      for (const [id, data] of Object.entries(docs)) batch.set(db.collection(name).doc(id), data);
    }
    await batch.commit();
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('writes 1,000 doors in batches, then the same file again adds nothing', async () => {
    const csvText = bigAttCsv(1000);
    expect(await last(await POST(req({ csvText, campaignId: 'camp-1', assignTo: 'rep-1' })))).toMatchObject({
      type: 'done',
      written: 1000,
      alreadyThere: 0,
    });
    const houses = await db.collection('houses').where('campaignId', '==', 'camp-1').get();
    expect(houses.size).toBe(1001);
    expect((await db.collection('houses').doc('att-n0').get()).data()).toMatchObject({
      assignedRepId: 'rep-1',
      managerId: 'mgr-1',
      last: null,
      packId: 'att-1111pa',
    });

    expect(await last(await POST(req({ csvText, campaignId: 'camp-1' })))).toMatchObject({
      type: 'done',
      written: 0,
      summary: { doors: 0, duplicates: 1000 },
    });
    expect((await db.collection('houses').where('campaignId', '==', 'camp-1').get()).size).toBe(1001);
  });

  it('never moves a door of another campaign, and keeps a door written after planning', async () => {
    const done = await last(await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' })));
    expect(done).toMatchObject({ type: 'done', written: 3, summary: { skipped: expect.arrayContaining([{ reason: 'in-other-campaign', count: 1 }]) } });
    expect((await db.collection('houses').doc('att-l9').get()).data()).toMatchObject({ campaignId: 'camp-2' });

    // A real ALREADY_EXISTS from a batched create: the route's retry writes the rest.
    // Firestore data of a house this suite just wrote through the route.
    const doc = (await db.collection('houses').doc('att-l1').get()).data() as HouseDoc;
    const result = await writeLeadHouses(db, [
      { id: 'att-l1', ...doc },
      { id: 'att-fresh', ...doc },
    ]);
    expect(result).toEqual({ written: 1, alreadyThere: 1 });
    expect((await db.collection('houses').doc('att-fresh').get()).exists).toBe(true);
  });
});
