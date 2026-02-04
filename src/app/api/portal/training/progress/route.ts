import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// GET /api/portal/training/progress - Get user's training progress
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    const snapshot = await adminDb
      .collection('userProgress')
      .where('userId', '==', userId)
      .get();

    const progress: Record<string, { completed: boolean; progress: number; lastAccessedAt: Date }> = {};

    snapshot.forEach((doc) => {
      const data = doc.data();
      progress[data.resourceId] = {
        completed: data.completed,
        progress: data.progress || 0,
        lastAccessedAt: data.lastAccessedAt?.toDate(),
      };
    });

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('Error fetching training progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch training progress' },
      { status: 500 }
    );
  }
}

// POST /api/portal/training/progress - Update user's training progress
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, resourceId, completed, progress } = body;

    if (!userId || !resourceId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, resourceId' },
        { status: 400 }
      );
    }

    // Check if progress record exists
    const existingSnapshot = await adminDb
      .collection('userProgress')
      .where('userId', '==', userId)
      .where('resourceId', '==', resourceId)
      .limit(1)
      .get();

    const updateData = {
      userId,
      resourceId,
      completed: completed || false,
      progress: progress || 0,
      lastAccessedAt: new Date(),
    };

    if (existingSnapshot.empty) {
      // Create new progress record
      await adminDb.collection('userProgress').add(updateData);
    } else {
      // Update existing record
      const docRef = existingSnapshot.docs[0].ref;
      await docRef.update(updateData);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating training progress:', error);
    return NextResponse.json(
      { error: 'Failed to update training progress' },
      { status: 500 }
    );
  }
}
