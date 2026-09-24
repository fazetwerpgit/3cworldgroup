import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import {
  buildExportRows,
  buildExportWorkbook,
  exportFilename,
  type ExportSensitive,
} from '@/lib/employeeImport/exportSheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = 'private, no-store';
// Firestore caps a write batch at 500 operations.
const AUDIT_BATCH_SIZE = 450;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': NO_STORE } });
}

// GET /api/portal/admin/employee-export — OWNER ONLY. Every active portal user
// as one .xlsx row, with the FULL SSN and driver's license number decrypted
// from userSensitive/{uid}, for drug and background checks. The workbook is
// built in memory and streamed back; it is never written to Storage, Firestore
// or disk, and no value is ever logged. Everyone whose SSN or DL# is included
// gets a sensitiveAccessLog row, plus one adminExports summary row. If those
// audit writes fail, no file is sent (fail closed).
export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  let body: Buffer;
  let filename: string;
  try {
    const usersSnap = await db.collection('users').where('status', '==', 'active').get();
    const users = usersSnap.docs.map((doc) => ({ uid: doc.id, data: doc.data() }));
    const sensitiveSnaps = users.length
      ? await db.getAll(...users.map((user) => db.collection('userSensitive').doc(user.uid)))
      : [];
    const sensitiveByUid = new Map<string, ExportSensitive>(
      sensitiveSnaps.map((snap) => [snap.id, snap.exists ? (snap.data() as ExportSensitive) : {}])
    );
    const { rows, revealedUids } = buildExportRows(users, sensitiveByUid);
    body = await buildExportWorkbook(rows);
    const at = new Date();
    filename = exportFilename(at);

    // Counts only: no names, no values.
    const writes: Array<{ collection: string; data: Record<string, unknown> }> = [
      {
        collection: 'adminExports',
        data: {
          kind: 'employee-data',
          by: gate.uid,
          byName: gate.name,
          at,
          count: rows.length,
          sensitiveCount: revealedUids.length,
        },
      },
      ...revealedUids.map((targetUid) => ({
        collection: 'sensitiveAccessLog',
        data: { targetUid, revealedBy: gate.uid, revealedByName: gate.name, at, kind: 'export' },
      })),
    ];
    for (let start = 0; start < writes.length; start += AUDIT_BATCH_SIZE) {
      const batch = db.batch();
      for (const write of writes.slice(start, start + AUDIT_BATCH_SIZE)) {
        batch.set(db.collection(write.collection).doc(), write.data);
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Employee export failed:', error instanceof Error ? error.message : 'unknown');
    return fail('The export failed. Nothing was downloaded.', 500);
  }

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(body.length),
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
