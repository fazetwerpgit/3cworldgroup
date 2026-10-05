import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { appBaseUrl, managerAlertEmail } from '@/lib/email/templates';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { MANAGEMENT_PLATFORM_ROLES } from '@/types/auth';
import type { AlertTaskKind } from '@/types/alerts';

const RENAG_MS = 24 * 3600 * 1000;

export interface NewAlertTask {
  kind: AlertTaskKind;
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
}

function requireDb() {
  if (!adminDb) {
    throw new Error('Database not configured');
  }
  return adminDb;
}

/**
 * Back-office users (owner/admin/operations), not inactive. Only they can open,
 * claim or dismiss alert tasks (requireVerifiedManagement) and every task links
 * into /portal/admin, so field managers are never notified.
 */
export async function getManagementUserIds(): Promise<string[]> {
  const db = requireDb();
  const platform = await db.collection('users').where('role', 'in', [...MANAGEMENT_PLATFORM_ROLES]).get();

  const ids = new Set<string>();
  platform.forEach((doc) => {
    if (doc.get('status') !== 'inactive') ids.add(doc.id);
  });
  return [...ids];
}

async function broadcast(task: NewAlertTask & { id: string }): Promise<void> {
  const db = requireDb();
  const userIds = await getManagementUserIds();

  const email = managerAlertEmail({
    title: task.title,
    message: task.message,
    link: `${appBaseUrl()}${task.link}`,
  });

  const results = await Promise.allSettled(
    [
      createNotificationForMany(userIds, {
        type: 'alert_task',
        title: task.title,
        message: task.message,
        link: task.link,
        metadata: { alertTaskId: task.id, kind: task.kind },
      }),
      ...userIds.flatMap((uid) => [
        sendPushToUser(uid, { title: task.title, body: task.message, url: task.link }),
        (async () => {
          const snap = await db.collection('users').doc(uid).get();
          const to = emailFromUserDoc(snap);
          if (to) await sendEmail({ to, ...email });
        })(),
      ]),
    ]
  );

  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('[alertTasks] broadcast channel failed', result.reason);
    }
  });
}

/** Creates and broadcasts; returns existing id when an open/claimed duplicate exists. */
export async function createAlertTask(input: NewAlertTask): Promise<string> {
  const db = requireDb();
  // One key doc per kind+subject makes the duplicate check atomic: concurrent
  // callers all read it, so only one transaction can create the task.
  const keyRef = db.collection('alertTaskKeys').doc(`${input.kind}__${input.subjectUserId}`);

  const result = await db.runTransaction(async (tx) => {
    const key = await tx.get(keyRef);
    const keyedId = key.exists ? (key.get('taskId') as string | undefined) : undefined;
    if (keyedId) {
      const keyed = await tx.get(db.collection('alertTasks').doc(keyedId));
      if (keyed.exists && ['open', 'claimed'].includes(keyed.get('status'))) {
        return { id: keyedId, created: false };
      }
    }
    // Tasks created before the key doc existed.
    const existing = await tx.get(
      db
        .collection('alertTasks')
        .where('kind', '==', input.kind)
        .where('subjectUserId', '==', input.subjectUserId)
        .where('status', 'in', ['open', 'claimed'])
        .limit(1)
    );
    if (!existing.empty) {
      tx.set(keyRef, { taskId: existing.docs[0].id });
      return { id: existing.docs[0].id, created: false };
    }

    const ref = db.collection('alertTasks').doc();
    tx.create(ref, { ...input, status: 'open', createdAt: new Date() });
    tx.set(keyRef, { taskId: ref.id });
    return { id: ref.id, created: true };
  });

  if (result.created) await broadcast({ ...input, id: result.id });
  return result.id;
}

export async function claimAlertTask(
  taskId: string,
  uid: string,
  name: string
): Promise<'claimed' | 'already_claimed' | 'not_found'> {
  const db = requireDb();
  const ref = db.collection('alertTasks').doc(taskId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'not_found';
    if (snap.get('status') !== 'open') return 'already_claimed';

    tx.update(ref, {
      status: 'claimed',
      claimedBy: uid,
      claimedByName: name,
      claimedAt: new Date(),
    });
    return 'claimed';
  });
}

export async function dismissAlertTask(
  taskId: string,
  uid: string,
  name: string
): Promise<'dismissed' | 'not_found'> {
  const db = requireDb();
  const ref = db.collection('alertTasks').doc(taskId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'not_found';

    const status = snap.get('status');
    if (status !== 'open' && status !== 'claimed') return 'dismissed';

    tx.update(ref, {
      status: 'resolved',
      resolvedAt: new Date(),
      dismissedBy: uid,
      dismissedByName: name,
    });
    return 'dismissed';
  });
}

/** Marks matching open/claimed tasks resolved, e.g. after activation. */
export async function resolveAlertTasks(
  subjectUserId: string,
  kinds?: AlertTaskKind[]
): Promise<void> {
  const db = requireDb();
  const snap = await db
    .collection('alertTasks')
    .where('subjectUserId', '==', subjectUserId)
    .where('status', 'in', ['open', 'claimed'])
    .get();
  const now = new Date();

  await Promise.all(
    snap.docs
      .filter((doc) => !kinds || kinds.includes(doc.get('kind') as AlertTaskKind))
      .map((doc) => doc.ref.update({ status: 'resolved', resolvedAt: now }))
  );
}

/** Pure: open tasks re-nag the whole group every 24h until claimed. */
export function shouldRenag(
  task: { status: string; createdAt: Date; lastNaggedAt?: Date },
  now: Date,
  thresholdMs: number = RENAG_MS
): boolean {
  if (task.status !== 'open') return false;
  const last = task.lastNaggedAt ?? task.createdAt;
  return now.getTime() - last.getTime() >= thresholdMs;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const maybeTimestamp = value as { toDate?: () => Date };
  return typeof maybeTimestamp.toDate === 'function' ? maybeTimestamp.toDate() : (value as Date);
}

/** Called by the cron (Task 11). Returns count of tasks re-nagged. */
export async function renagStaleTasks(now: Date): Promise<number> {
  const db = requireDb();
  const snap = await db.collection('alertTasks').where('status', '==', 'open').get();
  let count = 0;

  for (const doc of snap.docs) {
    const createdAt = toDate(doc.get('createdAt'));
    if (!createdAt) continue;

    const task = {
      status: doc.get('status') as string,
      createdAt,
      lastNaggedAt: toDate(doc.get('lastNaggedAt')),
    };
    if (!shouldRenag(task, now)) continue;

    // A subject that no longer exists has nothing left to assign. Close the
    // task instead of nagging about a ghost — the account may have been
    // deleted by a path that never knew about alerts.
    const subjectUserId = doc.get('subjectUserId') as string;
    const subject = await db.collection('users').doc(subjectUserId).get();
    if (!subject.exists) {
      await doc.ref.update({ status: 'resolved', resolvedAt: now, resolvedReason: 'subject account no longer exists' });
      continue;
    }

    await broadcast({
      kind: doc.get('kind') as AlertTaskKind,
      subjectUserId,
      subjectName: doc.get('subjectName') as string,
      title: `Still unclaimed: ${doc.get('title')}`,
      message: doc.get('message') as string,
      link: doc.get('link') as string,
      id: doc.id,
    });
    await doc.ref.update({ lastNaggedAt: now });
    count += 1;
  }

  return count;
}
