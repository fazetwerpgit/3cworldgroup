import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { TrainingResource } from '@/types';
import { requireVerifiedManagement, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';

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

    // Don't allow updating certain fields. `requestedBy` is no longer read as
    // identity, but updateData is built by spreading the whole body — keep
    // stripping it so an old client cannot persist it onto the training doc.
    const { id: _, createdAt, requestedBy: _requestedBy, ...updateData } = body;

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
        const folder = String(data.storagePath).replace(/[^/]+$/, ''); // training/{uploadId}/
        // Guard against a malformed path collapsing to an empty prefix (which
        // would target the whole bucket); only ever delete under training/.
        if (folder.startsWith('training/')) {
          await getOnboardingBucket().deleteFiles({ prefix: folder, force: true });
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
