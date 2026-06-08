import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getChatChannelsForUser, resolveRoles } from '@/types';

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const { role, fieldRole } = resolveRoles(userData?.role, userData?.fieldRole);

    return NextResponse.json({
      channels: getChatChannelsForUser(role, fieldRole),
    });
  } catch (error) {
    console.error('Error loading chat channels:', error);
    return NextResponse.json({ error: 'Failed to load chat channels' }, { status: 500 });
  }
}
