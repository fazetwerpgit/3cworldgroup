import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { buildExportRows, buildExportWorkbook, type ExportSensitive } from '@/lib/employeeImport/exportSheet';
import {
  buildOnboardingFileItems,
  loadOnboardingFileSource,
  mapLimit,
  personFilePrefix,
  signedPdfFileName,
  UID_PATTERN,
  uniqueName,
  uploadFileName,
} from '@/lib/onboarding/onboardingFile';
import { downloadFolderFiles } from '@/lib/onboarding/signFiles';
import { loadSignedPdf } from '@/lib/onboarding/signedPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = 'private, no-store';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': NO_STORE } });
}

// GET /api/portal/admin/onboarding-file/[uid]/download - OWNER ONLY. One
// person's whole onboarding file as a .zip: every signed e-sign PDF, every
// upload, and "<Last>-<First>-info.xlsx" (the employee export's row for this
// person, full SSN and DL# included). A file that cannot be read is skipped and
// listed in "<Last>-<First>-missing-files.txt" instead of failing the download.
//
// The zip is assembled in memory and streamed: Vercel caps a buffered function
// response at 4.5 MB, and two license photos plus the PDFs can pass that.
// The zip itself is never written to Storage, Firestore or disk, and no value
// is logged. Signed PDFs come from their stored copies only; a document signed
// before signing moved in-house with no stored copy is named in the note.
// One sensitiveAccessLog row and one adminExports row are written before any
// byte is sent; if they fail, nothing is sent (fail closed).
export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const { uid } = await params;
  if (!UID_PATTERN.test(uid)) return fail('Not found', 404);

  let zip: JSZip;
  let filename: string;
  try {
    const source = await loadOnboardingFileSource(db, uid);
    if (!source) return fail('Not found', 404);

    const prefix = personFilePrefix(typeof source.user.displayName === 'string' ? source.user.displayName : '');
    filename = `${prefix}-onboarding-file.zip`;
    zip = new JSZip();
    const taken = new Set<string>();
    const included: string[] = [];
    const missing: string[] = [];

    // Fetch every item's files at once (at most 4 items in flight), then add
    // them in checklist order so names and the audit list stay stable.
    const loaded = await mapLimit(buildOnboardingFileItems(source), 4, async (item) => {
      const doc = source.itemDocs.get(item.itemId) ?? {};
      const pdf = item.hasSignedPdf
        ? await loadSignedPdf(doc).then(
            (bytes) => bytes,
            () => null
          )
        : undefined;
      const uploads =
        item.referenceKind === 'storage'
          ? await downloadFolderFiles(typeof doc.reference === 'string' ? doc.reference : null)
          : null;
      return { item, pdf, uploads };
    });

    for (const { item, pdf, uploads } of loaded) {
      if (pdf) {
        zip.file(uniqueName(signedPdfFileName(prefix, item.itemId), taken), pdf);
        included.push(item.itemId);
      } else if (pdf === null) {
        missing.push(`${item.label}: signed PDF could not be loaded`);
      } else if (item.signedWithoutStoredCopy) {
        missing.push(`${item.label}: signed before signing moved in-house, no stored copy`);
      }
      if (uploads) {
        const { files, failed } = uploads;
        for (const file of files) {
          zip.file(uniqueName(uploadFileName(prefix, item.itemId, file.name), taken), file.data);
        }
        if (files.length > 0) included.push(item.itemId);
        if (failed.length > 0)
          missing.push(
            `${item.label}: ${failed.length === 1 ? 'a file' : `${failed.length} files`} could not be loaded`
          );
        else if (item.hasFiles && files.length === 0)
          missing.push(`${item.label}: no files found in its upload folder`);
      }
    }

    const { rows, revealedUids } = buildExportRows(
      [{ uid, data: source.user }],
      new Map<string, ExportSensitive>([[uid, source.sensitive as ExportSensitive]])
    );
    zip.file(uniqueName(`${prefix}-info.xlsx`, taken), await buildExportWorkbook(rows));
    if (missing.length > 0) {
      zip.file(
        uniqueName(`${prefix}-missing-files.txt`, taken),
        `These files could not be included in this download:\r\n\r\n${missing.map((line) => `- ${line}`).join('\r\n')}\r\n`
      );
    }

    // Who, whose, what, when. Item ids and counts only: no names, no values.
    const at = new Date();
    const batch = db.batch();
    batch.set(db.collection('sensitiveAccessLog').doc(), {
      targetUid: uid,
      revealedBy: gate.uid,
      revealedByName: gate.name,
      at,
      kind: 'export',
      source: 'onboarding-file-download',
      itemIds: included,
      sensitiveFields: revealedUids.includes(uid),
    });
    batch.set(db.collection('adminExports').doc(), {
      kind: 'onboarding-file',
      by: gate.uid,
      byName: gate.name,
      targetUid: uid,
      at,
      fileCount: Object.keys(zip.files).length,
      missingCount: missing.length,
    });
    await batch.commit();
  } catch (error) {
    console.error('Onboarding file download failed:', error instanceof Error ? error.message : 'unknown');
    return fail('The download failed. Nothing was downloaded.', 500);
  }

  // PDFs, photos and xlsx are already compressed: store them as they are.
  const stream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' });
  return new NextResponse(Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
