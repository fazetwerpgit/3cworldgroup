import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { validateFormUpload, buildFormAttachmentFolder } from '@/lib/forms/formUploads';

// Allowlisted form types that may receive attachments.
const ALLOWED_FORM_TYPES = ['payroll-dispute'];

// POST /api/portal/forms/upload - verified user uploads a form attachment.
// Writes ONLY under the verified caller's own folder. Returns the folder path.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const form = await request.formData();
    const formType = String(form.get('formType') ?? '');
    const file = form.get('file');

    if (!ALLOWED_FORM_TYPES.includes(formType) || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing or invalid formType/file' }, { status: 400 });
    }

    const check = validateFormUpload({ mime: file.type, size: file.size });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const folder = buildFormAttachmentFolder(gate.uid, formType);
    const objectPath = `${folder}file.${check.ext}`;

    const bucket = getOnboardingBucket();
    // Clear any prior attachment in this folder first. A replacement may have a
    // different extension (pdf -> jpg), so overwriting a fixed name is not enough:
    // the stale object would linger and the viewer could sign it instead. Deleting
    // the whole folder guarantees exactly one attachment ever exists here.
    await bucket.deleteFiles({ prefix: folder, force: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, { contentType: file.type, resumable: false });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading form attachment:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
