import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SaleStatus } from '@/types';

// Helper function to create a notification
async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, unknown>
) {
  if (!adminDb) return;

  try {
    await adminDb.collection('notifications').add({
      userId,
      type,
      title,
      message,
      link,
      metadata: metadata || {},
      read: false,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// POST /api/portal/sales/approve - Approve or reject a sale
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { saleId, status, approverId, approverName, rejectionReason } = body;

    // Validate required fields
    if (!saleId || !status || !approverId) {
      return NextResponse.json(
        { error: 'Missing required fields: saleId, status, approverId' },
        { status: 400 }
      );
    }

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('sales').doc(saleId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const saleData = doc.data();
    const currentStatus = saleData?.status;
    if (currentStatus !== 'pending') {
      return NextResponse.json(
        { error: `Sale is already ${currentStatus}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status: status as SaleStatus,
      approvedBy: approverId,
      approverName: approverName || '',
      approvedAt: new Date(),
      updatedAt: new Date(),
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    await docRef.update(updateData);

    // Create notification for the sales rep
    const salesRepId = saleData?.salesRepId;
    if (salesRepId) {
      if (status === 'approved') {
        const pointsEarned = saleData?.totalPoints || 0;
        await createNotification(
          salesRepId,
          'sale_approved',
          'Sale Approved! 🎉',
          `Your sale has been approved${pointsEarned > 0 ? `. You earned ${pointsEarned} points!` : '.'}`,
          `/portal/sales/${saleId}`,
          { saleId, pointsEarned }
        );

        // Also create a points notification if they earned points
        if (pointsEarned > 0) {
          await createNotification(
            salesRepId,
            'points_earned',
            `+${pointsEarned} Points Earned`,
            `Keep up the great work! Your total points are growing.`,
            '/portal/leaderboard',
            { pointsEarned, saleId }
          );
        }
      } else {
        await createNotification(
          salesRepId,
          'sale_rejected',
          'Sale Needs Review',
          rejectionReason || 'Your sale was not approved. Please review and resubmit.',
          `/portal/sales/${saleId}`,
          { saleId, rejectionReason }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sale ${status} successfully`,
    });
  } catch (error) {
    console.error('Error approving/rejecting sale:', error);
    return NextResponse.json(
      { error: 'Failed to process sale approval' },
      { status: 500 }
    );
  }
}
