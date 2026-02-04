import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { TrainingResource } from '@/types';

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

    const doc = await adminDb.collection('training').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const data = doc.data();
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

    const body = await request.json();
    const docRef = adminDb.collection('training').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Don't allow updating certain fields
    const { id: _, createdAt, ...updateData } = body;

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

    const docRef = adminDb.collection('training').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting training resource:', error);
    return NextResponse.json(
      { error: 'Failed to delete training resource' },
      { status: 500 }
    );
  }
}
