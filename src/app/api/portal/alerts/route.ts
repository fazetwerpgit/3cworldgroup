import { NextRequest, NextResponse } from 'next/server';
import { requireManagement } from '@/lib/auth/requireManagement';
import { adminDb } from '@/lib/firebase/admin';

function serializeDate(value: unknown): string | null {
  if (!value) return null;
  const maybeTimestamp = value as { toDate?: () => Date };
  const date = typeof maybeTimestamp.toDate === 'function' ? maybeTimestamp.toDate() : value;
  return date instanceof Date ? date.toISOString() : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const gate = await requireManagement(
      request.nextUrl.searchParams.get('requestedBy')
    );
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const snap = await adminDb
      .collection('alertTasks')
      .where('status', 'in', ['open', 'claimed'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const tasks = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: serializeDate(data.createdAt),
        claimedAt: serializeDate(data.claimedAt),
        resolvedAt: serializeDate(data.resolvedAt),
        lastNaggedAt: serializeDate(data.lastNaggedAt),
      };
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching alert tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert tasks' },
      { status: 500 }
    );
  }
}
