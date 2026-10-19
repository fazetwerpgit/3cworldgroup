import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { TrainingResource } from '@/types';
import { requireVerifiedManagement, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { TRAINING_EDITABLE_FIELDS, isValidTrainingStoragePath, trainingUploadFolder } from '@/lib/training/storagePath';

// GET /api/portal/training/[id] - Get a single training resource
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // The shared API allowlist admits a mid-onboarding rep to assigned training.
    // Single token round-trip: isManagement decides publication access below.
    const gate = await requireVerifiedRequester(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const doc = await adminDb.collection('training').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const data = doc.data();

    // Unpublished drafts are management-only. 404 (not 403) so a non-management
    // caller can't distinguish "draft exists" from "no such id".
    if (!data?.isPublished && !gate.isManagement) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const resource: TrainingResource = {
      id: doc.id,
      ...data,
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
    } as TrainingResource;

    return NextResponse.json({ resource });
  } catch (error) {
    console.error('Error fetching training resource:', error);
    return NextResponse.json(
      { error: 'Failed to fetch training resource' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/training/[id] - Update a training resource
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Only admin/operations may edit training content — gate before the body is
    // read.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();

    const docRef = adminDb.collection('training').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Only the resource's own fields can change (no mass assignment of
    // arbitrary keys), and a storagePath must name one file in one upload
    // folder: DELETE clears that folder.
    const updateData: Record<string, unknown> = {};
    for (const field of TRAINING_EDITABLE_FIELDS) {
      if (body && typeof body === 'object' && field in body) updateData[field] = body[field];
    }
    if ('storagePath' in updateData && updateData.storagePath !== '' && !isValidTrainingStoragePath(updateData.storagePath)) {
      return NextResponse.json({ error: 'Invalid storagePath' }, { status: 400 });
    }

    await docRef.update({
      ...updateData,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating training resource:', error);
    return NextResponse.json(
      { error: 'Failed to update training resource' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/training/[id] - Delete a training resource
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Only admin/operations may delete training content.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const docRef = adminDb.collection('training').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const data = doc.data();
    await docRef.delete();

    // Best-effort: remove the uploaded file(s) under training/{uploadId}/.
    if (data?.storagePath) {
      try {
        // Only ever one upload folder (training/{uploadId}/): a malformed path
        // must not widen the prefix to training/ or the whole bucket.
        const folder = trainingUploadFolder(data.storagePath);
        if (folder) {
          await getOnboardingBucket().deleteFiles({ prefix: folder, force: true });
        } else {
          console.error('Training file cleanup skipped: invalid storagePath', { id });
        }
      } catch (err) {
        console.error('Training file cleanup failed:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting training resource:', error);
    return NextResponse.json(
      { error: 'Failed to delete training resource' },
      { status: 500 }
    );
  }
}
