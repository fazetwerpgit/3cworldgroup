import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { syncChatChannels } from '@/lib/chat/channels';

export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const result = await syncChatChannels();
    return NextResponse.json({ success: true, channelsSynced: result.channelsSynced });
  } catch (error) {
    console.error('Error syncing chat channels:', error);
    return NextResponse.json({ error: 'Failed to sync chat channels' }, { status: 500 });
  }
}
