import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import {
  createChannelId,
  isDemoSandboxChannel,
  isEligibleChatMember,
  getMemberIdsForAudience,
  isChatChannelAudience,
  readExtraMemberIds,
  toChatChannel,
} from '@/lib/chat/channels';
import { deletableChatObjectPaths, preserveReportedEvidence, storageErrorCode } from '@/lib/chat/evidence';
import { getChatStorageBucketName } from '@/lib/chat/media';
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
    }

    const ref = adminDb.collection('chatChannels').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    if ('audience' in updates) {
      // The demo sandbox's memberIds never follow an audience (demo accounts plus
      // admins/owners only); an audience edit there must not put real people in.
      if (isDemoSandboxChannel(snap.data())) {
        return NextResponse.json({ error: 'The demo sandbox has no audience to change' }, { status: 400 });
      }
      // Manual additions (extraMemberIds) survive an audience change, like
      // syncChatChannels: an eligible extra stays in memberIds so the Firestore
      // realtime rules and chat pushes keep reaching them.
      const [activeUsersSnap, pendingUsersSnap] = await Promise.all([
        adminDb.collection('users').where('status', '==', 'active').get(),
        adminDb.collection('users').where('status', '==', 'pending').get(),
      ]);
      const users = [...activeUsersSnap.docs, ...pendingUsersSnap.docs];
      const audienceMemberIds = await getMemberIdsForAudience(updates.audience as ChatChannelAudience, users);
      const extras = new Set(readExtraMemberIds(snap.data() ?? {}));
      const eligibleExtras = users
        .filter((doc) => extras.has(doc.id) && isEligibleChatMember(doc.data()))
        .map((doc) => doc.id);
      updates.memberIds = Array.from(new Set([...audienceMemberIds, ...eligibleExtras]));
    }

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

    // Uploads (photo, or PDF and its preview) go with the channel: their tokened
    // URLs would otherwise keep them reachable. A reported upload is copied to
    // the moderation folder first; when that fails it stays (new token, queued
    // for the cron sweep), as on a single message delete.
    const objectPaths = new Set<string>();
    const heldPaths = new Set<string>();
    let deletedMessages = 0;
    while (true) {
      const messagesSnap = await ref.collection('messages').limit(400).get();
      if (messagesSnap.empty) break;
      for (const doc of messagesSnap.docs) {
        const attachment = doc.data()?.attachment;
        const paths = deletableChatObjectPaths(attachment, id);
        if (paths.length === 0) continue;
        const target = (await preserveReportedEvidence(id, doc.id, attachment)) ? objectPaths : heldPaths;
        paths.forEach((path) => target.add(path));
      }
      const batch = adminDb.batch();
      messagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deletedMessages += messagesSnap.docs.length;
    }

    await ref.delete();

    if (getChatStorageBucketName()) {
      for (const objectPath of objectPaths) {
        if (heldPaths.has(objectPath)) continue;
        try {
          await getOnboardingBucket().file(objectPath).delete({ ignoreNotFound: true });
        } catch (storageError) {
          if (storageErrorCode(storageError) === '404') continue;
          console.error(`Error deleting chat upload (channel ${id}): code ${storageErrorCode(storageError)}`);
        }
      }
    }
    return NextResponse.json({ success: true, deletedMessages });
  } catch (error) {
    console.error('Error deleting chat channel:', error);
    return NextResponse.json({ error: 'Failed to delete chat channel' }, { status: 500 });
  }
}
