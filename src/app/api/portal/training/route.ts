import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { TrainingResource } from '@/types';

// GET /api/portal/training - Get training resources
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const isRequired = searchParams.get('required');

    let query = adminDb
      .collection('training')
      .where('isPublished', '==', true)
      .orderBy('order', 'asc');

    const snapshot = await query.get();
    let resources: TrainingResource[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      resources.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as TrainingResource);
    });

    // Filter in memory (Firestore has limitations on compound queries)
    if (category) {
      resources = resources.filter((r) => r.category === category);
    }
    if (type) {
      resources = resources.filter((r) => r.type === type);
    }
    if (isRequired === 'true') {
      resources = resources.filter((r) => r.isRequired);
    }

    return NextResponse.json({ resources });
  } catch (error) {
    console.error('Error fetching training resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch training resources' },
      { status: 500 }
    );
  }
}

// POST /api/portal/training - Create a new training resource (admin/operations only)
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      type,
      category,
      url,
      thumbnailUrl,
      duration,
      requiredRoles,
      isRequired,
      isPublished,
      order,
    } = body;

    // Validate required fields
    if (!title || !type || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: title, type, category' },
        { status: 400 }
      );
    }

    const newResource = {
      title,
      description: description || '',
      type,
      category,
      url: url || '',
      thumbnailUrl: thumbnailUrl || '',
      duration: duration || 0,
      requiredRoles: requiredRoles || [],
      isRequired: isRequired || false,
      isPublished: isPublished !== false,
      order: order || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('training').add(newResource);

    return NextResponse.json({
      success: true,
      resource: {
        id: docRef.id,
        ...newResource,
      },
    });
  } catch (error) {
    console.error('Error creating training resource:', error);
    return NextResponse.json(
      { error: 'Failed to create training resource' },
      { status: 500 }
    );
  }
}
