import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { CHAT_REPORTS_PATH, isSafeDocId, notifyChatModerators } from '@/lib/chat/moderation';

// Per-user chat blocks: users/{uid}/chatBlocks/{blockedUid}. Blocking hides the
// person's messages on the blocker's own screens and stops chat pushes from
// them (sendChatPush); it never removes anyone from a channel, and the blocked
// person is not told. Admin SDK only, so the list is read through GET here.

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

// Blocks are a handful per person; the cap only bounds a pathological list.
const MAX_BLOCKS_LISTED = 500;

function blocksOf(uid: string) {
  return adminDb!.collection('users').doc(uid).collection('chatBlocks');
}

async function readTargetUid(request: NextRequest): Promise<string | null> {
  const body = await request.json().catch(() => null);
  const uid = body && typeof body === 'object' ? (body as Record<string, unknown>).uid : undefined;
  return isSafeDocId(uid) ? uid : null;
}

// GET — the caller's own block list: [{ uid, name }].
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const snapshot = await blocksOf(result.user.uid).limit(MAX_BLOCKS_LISTED).get();
    const blocked = snapshot.docs.map((doc) => {
      const name = doc.data().name;
      return { uid: doc.id, name: typeof name === 'string' && name ? name : '3C User' };
    });
    return NextResponse.json({ blocked });
  } catch (error) {
    console.error('Error loading chat blocks:', error);
    return NextResponse.json({ error: 'Failed to load blocked people' }, { status: 500 });
  }
}

// POST { uid } — block someone. The back office hears about each new block.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const target = await readTargetUid(request);
    if (!target) return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    if (target === user.uid) return NextResponse.json({ error: 'You can’t block yourself' }, { status: 400 });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const targetSnap = await adminDb.collection('users').doc(target).get();
    if (!targetSnap.exists) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    const targetData = targetSnap.data() ?? {};
    const name =
      (typeof targetData.displayName === 'string' && targetData.displayName) ||
      (typeof targetData.email === 'string' && targetData.email) ||
      '3C User';

    try {
      await blocksOf(user.uid).doc(target).create({ blockedAt: FieldValue.serverTimestamp(), name });
    } catch (createError) {
      if (!isAlreadyExists(createError)) throw createError;
      return NextResponse.json({ success: true, duplicate: true, name });
    }

    after(() =>
      notifyChatModerators({
        title: 'Chat block',
        message: `${user.displayName} blocked ${name} in team chat.`,
        link: CHAT_REPORTS_PATH,
      })
    );

    return NextResponse.json({ success: true, name });
  } catch (error) {
    console.error('Error blocking chat user:', error);
    return NextResponse.json({ error: 'Failed to block' }, { status: 500 });
  }
}

// DELETE { uid } — unblock. Deleting a block that isn't there still succeeds.
export async function DELETE(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const target = await readTargetUid(request);
    if (!target) return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    await blocksOf(result.user.uid).doc(target).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unblocking chat user:', error);
    return NextResponse.json({ error: 'Failed to unblock' }, { status: 500 });
  }
}
