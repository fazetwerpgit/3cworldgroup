import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { validateFormUpload, resolveFormUploadFolder, resolveUploadMime } from '@/lib/forms/formUploads';

// POST /api/portal/forms/upload - verified user uploads a form attachment.
// Writes ONLY under the verified caller's own folder. Payroll Dispute / Leads
// Request uploads must carry a per-submission uploadId and land in
// form-attachments/{uid}/{formType}/{uploadId}/[{slot}/]. Returns the folder path.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const form = await request.formData();
    const formType = String(form.get('formType') ?? '');
    const slot = String(form.get('slot') ?? '');
    const uploadId = String(form.get('uploadId') ?? '');
    const file = form.get('file');

    const folder = resolveFormUploadFolder(gate.uid, formType, slot, uploadId);
    if (!folder || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing or invalid formType/slot/uploadId/file' },
        { status: 400 }
      );
    }

    // iOS can send a HEIC with an empty type: judge it by its extension then.
    const mime = resolveUploadMime(file.type, file.name);
    const check = validateFormUpload({ mime, size: file.size });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const objectPath = `${folder}file.${check.ext}`;

    const bucket = getOnboardingBucket();
    // Clear any prior attachment in this slot folder first, so a replacement with a
    // different extension can't leave a stale object the viewer might sign instead.
    // The folder is scoped to this one submission (or sale), so this only ever
    // replaces the caller's own not-yet-submitted file, never another record's.
    await bucket.deleteFiles({ prefix: folder, force: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, { contentType: mime, resumable: false });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading form attachment:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
