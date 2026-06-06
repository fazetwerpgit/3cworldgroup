import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { CHANNELS, ChannelOnboardingStatus } from '@/types';

// GET /api/portal/pipeline/channels?userId=xxx - Per-channel credentialing
// status for one rep. Merges the CHANNELS catalog with userChannelOnboarding
// docs (doc id: userId_channelId).
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const active = CHANNELS.filter((c) => c.active);
    const refs = active.map((c) =>
      adminDb!.collection('userChannelOnboarding').doc(`${userId}_${c.id}`)
    );
    const docs = refs.length > 0 ? await adminDb.getAll(...refs) : [];

    const channels = active.map((channel, i) => {
      const progress = docs[i]?.exists ? docs[i].data() : null;
      return {
        ...channel,
        status: (progress?.status ?? 'not_started') as ChannelOnboardingStatus,
        reference: progress?.reference ?? null,
        submittedAt: progress?.submittedAt?.toDate() ?? null,
        clearedAt: progress?.clearedAt?.toDate() ?? null,
      };
    });

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error fetching channel statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channel statuses' },
      { status: 500 }
    );
  }
}

// POST /api/portal/pipeline/channels - Ops updates a rep's credentialing
// status on a channel (not_started -> submitted -> cleared). Sensitive
// credentialing data lives with the vendor/DSI - we store status + an
// optional reference only.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, channelId, status, reference } = body;

    if (!userId || !channelId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, channelId, status' },
        { status: 400 }
      );
    }

    const channel = CHANNELS.find((c) => c.id === channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
    }

    if (!['not_started', 'submitted', 'cleared'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be not_started, submitted or cleared' },
        { status: 400 }
      );
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const update: Record<string, unknown> = {
      userId,
      channelId,
      status,
      reference: typeof reference === 'string' ? reference.trim().slice(0, 500) : '',
      updatedAt: now,
    };
    if (status === 'submitted') update.submittedAt = now;
    if (status === 'cleared') update.clearedAt = now;

    await adminDb
      .collection('userChannelOnboarding')
      .doc(`${userId}_${channelId}`)
      .set(update, { merge: true });

    // Tell the rep when they're cleared on a channel
    if (status === 'cleared') {
      await adminDb.collection('notifications').add({
        userId,
        type: 'announcement',
        title: `${channel.name} - You're Cleared!`,
        message: `You are now credentialed to sell ${channel.name}${channel.credentialingPath === 'dsi' ? ' (via DSI)' : ''}.`,
        link: '/portal/dashboard',
        metadata: { channelId },
        read: false,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${channel.name} set to ${status}`,
    });
  } catch (error) {
    console.error('Error updating channel status:', error);
    return NextResponse.json(
      { error: 'Failed to update channel status' },
      { status: 500 }
    );
  }
}
