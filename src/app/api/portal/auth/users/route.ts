import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { User, resolveRoles, getEffectiveRole } from '@/types';

// GET /api/portal/auth/users - Get all users
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    const query = adminDb.collection('users').orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    let users: User[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        ...resolveRoles(data.role, data.fieldRole),
        isIBO: data.isIBO ?? false,
        // TODO: migrate Firestore managerId -> reportsToId
        reportsToId: data.reportsToId ?? data.managerId,
        territoryId: data.territoryId,
        phone: data.phone,
        avatarUrl: data.avatarUrl,
        status: data.status,
        hireDate: data.hireDate?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as User);
    });

    // Filter in memory (Firestore has limitations on compound queries).
    // Match on the effective role so field users (role undefined after
    // resolveRoles) are filterable by their fieldRole.
    if (role) {
      users = users.filter((u) => getEffectiveRole(u) === role);
    }
    if (status) {
      users = users.filter((u) => u.status === status);
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
