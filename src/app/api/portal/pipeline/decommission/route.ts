import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { DecommissionReason, DecommissionReasonLabels } from '@/types';

const VALID_REASONS: DecommissionReason[] = ['non_activity', 'wrongdoing', 'manager_fire'];

// POST /api/portal/pipeline/decommission - Deactivate a rep with an audit
// trail. Sets status 'inactive' (AuthContext blocks non-active sign-ins) and
// stores who/why/when. The account and history are preserved - this is a
// deactivation, not a delete.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, reason, notes, decommissionedBy, decommissionedByName } = body;

    if (!userId || !reason || !decommissionedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, reason, decommissionedBy' },
        { status: 400 }
      );
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = doc.data();
    if (data?.decommission) {
      return NextResponse.json(
        { error: 'User is already decommissioned' },
        { status: 400 }
      );
    }
    // Guard: only field reps go through decommission (platform users are
    // managed in User Management directly)
    if (data?.role === 'admin' || data?.role === 'operations') {
      return NextResponse.json(
        { error: 'Platform users cannot be decommissioned. Use User Management.' },
        { status: 400 }
      );
    }

    const now = new Date();
    await docRef.update({
      status: 'inactive',
      decommission: {
        reason,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : '',
        decommissionedBy,
        decommissionedByName: decommissionedByName || '',
        decommissionedAt: now,
      },
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      message: `${data?.displayName ?? 'User'} decommissioned (${DecommissionReasonLabels[reason as DecommissionReason]})`,
    });
  } catch (error) {
    console.error('Error decommissioning user:', error);
    return NextResponse.json(
      { error: 'Failed to decommission user' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/pipeline/decommission - Reinstate a decommissioned rep
// (undo path: clears the audit record and reactivates the account).
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const docRef = adminDb.collection('users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!doc.data()?.decommission) {
      return NextResponse.json(
        { error: 'User is not decommissioned' },
        { status: 400 }
      );
    }

    await docRef.update({
      status: 'active',
      decommission: FieldValue.delete(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, message: 'User reinstated' });
  } catch (error) {
    console.error('Error reinstating user:', error);
    return NextResponse.json(
      { error: 'Failed to reinstate user' },
      { status: 500 }
    );
  }
}
