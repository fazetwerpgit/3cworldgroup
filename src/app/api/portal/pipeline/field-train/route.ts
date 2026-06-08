import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { resolveRoles } from '@/types';

async function isManagement(userId: string): Promise<boolean> {
  const doc = await adminDb!.collection('users').doc(userId).get();
  if (!doc.exists) return false;
  const { role } = resolveRoles(doc.data()?.role, doc.data()?.fieldRole);
  return role === 'admin' || role === 'operations';
}

// POST /api/portal/pipeline/field-train - "Message manager to field train".
// Sends an in-app notification to the rep's manager (reportsToId, legacy
// fallback managerId) asking them to schedule field training.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, requestedBy, requestedByName, note } = body;

    if (!userId || !requestedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, requestedBy' },
        { status: 400 }
      );
    }
    if (!(await isManagement(requestedBy))) {
      return NextResponse.json(
        { error: 'Only operations or admin can request field training' },
        { status: 403 }
      );
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const managerId = userData?.reportsToId ?? userData?.managerId;
    if (!managerId) {
      return NextResponse.json(
        { error: 'This rep has no manager assigned. Assign a manager first in User Management.' },
        { status: 400 }
      );
    }

    const managerDoc = await adminDb.collection('users').doc(managerId).get();
    if (!managerDoc.exists) {
      return NextResponse.json(
        { error: 'Assigned manager no longer exists. Update the rep in User Management.' },
        { status: 400 }
      );
    }

    const repName = userData?.displayName ?? userData?.email ?? 'A new rep';
    const now = new Date();

    await adminDb.collection('notifications').add({
      userId: managerId,
      type: 'announcement',
      title: 'Field Training Requested',
      message:
        `${repName} is ready for field training.` +
        (note ? ` Note from ${requestedByName || 'operations'}: ${String(note).trim().slice(0, 500)}` : ''),
      link: '/portal/admin/pipeline',
      metadata: { repId: userId, requestedBy },
      read: false,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: `Field training request sent to ${managerDoc.data()?.displayName ?? 'manager'}`,
    });
  } catch (error) {
    console.error('Error requesting field training:', error);
    return NextResponse.json(
      { error: 'Failed to request field training' },
      { status: 500 }
    );
  }
}
