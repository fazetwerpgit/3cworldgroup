import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { buildSensitiveDoc } from '@/lib/onboarding/sensitiveFields';
import { decryptField, last4 } from '@/lib/security/fieldEncryption';
import { parseEmployeeSheet, SheetReadError } from '@/lib/employeeImport/parseSheet';
import {
  buildImportPlan,
  matchUsers,
  toPersonView,
  type ImportField,
  type PersonPlan,
  type SensitiveOnFile,
} from '@/lib/employeeImport/plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;
// Multipart framing around the file; anything past this cannot be a 2 MB file.
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024;
const WRITE_CONCURRENCY = 10;
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const FIELDS: ImportField[] = ['phone', 'address', 'shirt', 'ssn', 'dl'];

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

// Refuses to write unless the server's key reads an SSN already on file: a
// wrong or rotated key would otherwise store records nobody can ever decrypt.
async function encryptionKeyMatches(db: Firestore): Promise<boolean> {
  const snap = await db.collection('userSensitive').where('ssnEncrypted', '>', '').limit(5).get();
  const sample = snap.docs
    .map((doc) => doc.data())
    .find((data) => typeof data.ssnEncrypted === 'string' && typeof data.ssnLast4 === 'string');
  if (!sample) return false;
  try {
    return last4(decryptField(sample.ssnEncrypted)) === sample.ssnLast4;
  } catch {
    return false;
  }
}

// One atomic batch per person: their profile fields and their encrypted fields
// land together or not at all.
async function writePerson(db: Firestore, person: PersonPlan, updatedBy: string): Promise<void> {
  const batch = db.batch();
  const now = new Date();
  if (Object.keys(person.userUpdates).length > 0) {
    batch.update(db.collection('users').doc(person.uid), { ...person.userUpdates, updatedAt: now });
  }
  if (person.sensitive.ssn || person.sensitive.dlNumber) {
    const built = buildSensitiveDoc(person.sensitive);
    if (!built.ok) throw new Error('Sensitive field failed validation');
    // merge: only the filled field is written; the other one is never touched.
    batch.set(db.collection('userSensitive').doc(person.uid), { ...built.doc, updatedAt: now, updatedBy }, { merge: true });
  }
  await batch.commit();
}

// POST /api/portal/admin/employee-import — multipart { file: .xlsx, mode }.
// OWNER ONLY. 'preview' says, per active portal user, which EMPTY profile fields
// the owner's employee sheet would fill; 'apply' re-reads the same file and
// writes them (SSN and DL# encrypted with the server key). The file is read in
// memory and dropped. No response or log ever carries a phone, address, SSN or
// DL value: people come back as field names only.
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
    return fail('The file is over 2 MB', 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Upload the spreadsheet as a file', 400);
  }
  const mode = form.get('mode');
  if (mode !== 'preview' && mode !== 'apply') return fail("mode must be 'preview' or 'apply'", 400);
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Choose the .xlsx file', 400);
  if (file.size > MAX_BYTES) return fail('The file is over 2 MB', 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) return fail('The file is over 2 MB', 413);
  // An .xlsx is a zip archive: it starts with the local-file-header "PK\x03\x04".
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return fail('Upload the .xlsx file', 400);

  let rows;
  try {
    rows = await parseEmployeeSheet(buffer);
  } catch (error) {
    // Never logged: a parser message could quote a cell.
    const reason = error instanceof SheetReadError ? error.message : "Couldn't read that file";
    return fail(`${reason}. Upload the .xlsx file.`, 400);
  }

  try {
    const usersSnap = await db.collection('users').where('status', '==', 'active').get();
    const match = matchUsers(
      usersSnap.docs.map((doc) => ({ uid: doc.id, data: doc.data() })),
      rows
    );
    const sensitiveSnaps = match.pairs.length
      ? await db.getAll(...match.pairs.map(({ user }) => db.collection('userSensitive').doc(user.uid)))
      : [];
    const sensitiveByUid = new Map<string, SensitiveOnFile>(
      sensitiveSnaps.map((snap) => [snap.id, snap.exists ? (snap.data() as SensitiveOnFile) : {}])
    );
    const plan = buildImportPlan(match, sensitiveByUid);
    const summary = {
      sheetRows: plan.sheetRows,
      matched: plan.people.length,
      unmatchedRows: plan.unmatchedRows,
      skipped: plan.skipped,
    };

    if (mode === 'preview') {
      return NextResponse.json({ ...summary, people: plan.people.map(toPersonView) }, { headers: NO_STORE });
    }

    if (!(await encryptionKeyMatches(db))) return fail('Encryption key check failed', 500);

    const toWrite = plan.people.filter((person) => person.willFill.length > 0);
    // Audit first, counts only (no names, no values). If it cannot be written,
    // nothing is imported.
    const audit = await db.collection('adminImports').add({
      kind: 'employee-sheet',
      by: gate.uid,
      byName: gate.name,
      at: new Date(),
      status: 'running',
      counts: {
        sheetRows: plan.sheetRows,
        matched: plan.people.length,
        unmatchedRows: plan.unmatchedRows,
        skipped: plan.skipped.length,
        planned: toWrite.length,
      },
    });

    const updatedBy = `import:owner ${gate.uid}`;
    const failedUids = new Set<string>();
    for (let start = 0; start < toWrite.length; start += WRITE_CONCURRENCY) {
      const chunk = toWrite.slice(start, start + WRITE_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((person) => writePerson(db, person, updatedBy)));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedUids.add(chunk[index].uid);
          console.error('Employee import write failed for', chunk[index].uid);
        }
      });
    }

    const filled = Object.fromEntries(FIELDS.map((field) => [field, 0])) as Record<ImportField, number>;
    for (const person of toWrite) {
      if (failedUids.has(person.uid)) continue;
      for (const field of person.willFill) filled[field] += 1;
    }
    const updated = toWrite.length - failedUids.size;
    try {
      await audit.update({ status: 'done', 'counts.updated': updated, 'counts.failed': failedUids.size, 'counts.filled': filled });
    } catch (error) {
      console.error('Employee import audit update failed:', error instanceof Error ? error.message : 'unknown');
    }

    return NextResponse.json(
      {
        ...summary,
        updated,
        failed: failedUids.size,
        people: plan.people.map((person) =>
          failedUids.has(person.uid)
            ? { ...toPersonView(person), willFill: [], issues: [...person.issues, 'Save failed, nothing changed'] }
            : toPersonView(person)
        ),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Employee import failed:', error instanceof Error ? error.message : 'unknown');
    return fail('The import failed. Nothing was saved.', 500);
  }
}
