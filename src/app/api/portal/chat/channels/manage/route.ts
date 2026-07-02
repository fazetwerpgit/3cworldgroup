import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import {
  createChannelId,
  getMemberIdsForAudience,
  isChatChannelAudience,
  toChatChannel,
} from '@/lib/chat/channels';
import { ChatChannelAudience } from '@/types';

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateName(value: unknown): string | null {
  const name = cleanString(value);
  if (!name) return 'Channel name is required';
  if (name.length > 60) return 'Channel name is limited to 60 characters';
  return null;
}

function validateDescription(value: unknown): string | null {
  const description = cleanString(value);
  if (description.length > 200) return 'Description is limited to 200 characters';
  return null;
}

async function getExistingChannelDocs() {
  if (!adminDb) throw new Error('Database not configured');
  return adminDb.collection('chatChannels').orderBy('order', 'asc').get();
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const snapshot = await getExistingChannelDocs();
    const channels = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const channel = toChatChannel(doc.id, data);
        if (!channel) return null;
        return {
          ...channel,
          memberCount: Array.isArray(data.memberIds) ? data.memberIds.length : 0,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error loading managed chat channels:', error);
    return NextResponse.json({ error: 'Failed to load chat channels' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const nameError = validateName(body.name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    const descriptionError = validateDescription(body.description);
    if (descriptionError) return NextResponse.json({ error: descriptionError }, { status: 400 });
    if (!isChatChannelAudience(body.audience)) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
    }

    const existingSnap = await getExistingChannelDocs();
    const existingIds = existingSnap.docs.map((doc) => doc.id);
    const id = createChannelId(body.name, existingIds);
    const maxOrder = existingSnap.docs.reduce((max, doc) => {
      const order = doc.data().order;
      return typeof order === 'number' && Number.isFinite(order) ? Math.max(max, order) : max;
    }, 0);
    const audience = body.audience as ChatChannelAudience;
    const memberIds = await getMemberIdsForAudience(audience);

    await adminDb.collection('chatChannels').doc(id).set({
      id,
      name: cleanString(body.name),
      description: cleanString(body.description),
      audience,
      order: maxOrder + 1,
      active: true,
      memberIds,
      createdBy: gate.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating chat channel:', error);
    return NextResponse.json({ error: 'Failed to create chat channel' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const id = cleanString(body.id);
    if (!id) return NextResponse.json({ error: 'Channel id is required' }, { status: 400 });

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if ('name' in body) {
      const nameError = validateName(body.name);
      if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
      updates.name = cleanString(body.name);
    }
    if ('description' in body) {
      const descriptionError = validateDescription(body.description);
      if (descriptionError) return NextResponse.json({ error: descriptionError }, { status: 400 });
      updates.description = cleanString(body.description);
    }
    if ('active' in body) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Active must be true or false' }, { status: 400 });
      }
      updates.active = body.active;
    }
    if ('audience' in body) {
      if (!isChatChannelAudience(body.audience)) {
        return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
      }
      updates.audience = body.audience;
      updates.memberIds = await getMemberIdsForAudience(body.audience);
    }

    const ref = adminDb.collection('chatChannels').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    await ref.set(updates, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating chat channel:', error);
    return NextResponse.json({ error: 'Failed to update chat channel' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const id = cleanString(body.id);
    if (!id) return NextResponse.json({ error: 'Channel id is required' }, { status: 400 });

    const ref = adminDb.collection('chatChannels').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    let deletedMessages = 0;
    while (true) {
      const messagesSnap = await ref.collection('messages').limit(400).get();
      if (messagesSnap.empty) break;
      const batch = adminDb.batch();
      messagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deletedMessages += messagesSnap.docs.length;
    }

    await ref.delete();
    return NextResponse.json({ success: true, deletedMessages });
  } catch (error) {
    console.error('Error deleting chat channel:', error);
    return NextResponse.json({ error: 'Failed to delete chat channel' }, { status: 500 });
  }
}
