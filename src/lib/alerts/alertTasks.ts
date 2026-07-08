import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, managerAlertEmail } from '@/lib/email/templates';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { MANAGEMENT_FIELD_ROLES } from '@/types/auth';
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

/** All admin/operations users plus active management field-role users. */
export async function getManagementUserIds(): Promise<string[]> {
  const db = requireDb();
  const [platform, field] = await Promise.all([
    db.collection('users').where('role', 'in', ['admin', 'operations']).get(),
    db.collection('users').where('fieldRole', 'in', [...MANAGEMENT_FIELD_ROLES]).get(),
  ]);

  const ids = new Set<string>();
  platform.forEach((doc) => {
    if (doc.get('status') !== 'inactive') ids.add(doc.id);
  });
  field.forEach((doc) => {
    if (doc.get('status') === 'active') ids.add(doc.id);
  });
  return [...ids];
}

async function broadcast(task: NewAlertTask & { id: string }): Promise<void> {
  const db = requireDb();
  const userIds = await getManagementUserIds();

  await createNotificationForMany(userIds, {
    type: 'alert_task',
    title: task.title,
    message: task.message,
    link: task.link,
    metadata: { alertTaskId: task.id, kind: task.kind },
  });

  const email = managerAlertEmail({
    title: task.title,
    message: task.message,
    link: `${appBaseUrl()}${task.link}`,
  });

  const results = await Promise.allSettled(
    userIds.flatMap((uid) => [
      sendPushToUser(uid, { title: task.title, body: task.message, url: task.link }),
      (async () => {
        const snap = await db.collection('users').doc(uid).get();
        const to = snap.get('email') as string | undefined;
        if (to) await sendEmail({ to, ...email });
      })(),
    ])
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
  const existing = await db
    .collection('alertTasks')
    .where('kind', '==', input.kind)
    .where('subjectUserId', '==', input.subjectUserId)
    .where('status', 'in', ['open', 'claimed'])
    .limit(1)
    .get();

  if (!existing.empty) return existing.docs[0].id;

  const ref = await db.collection('alertTasks').add({
    ...input,
    status: 'open',
    createdAt: new Date(),
  });
  await broadcast({ ...input, id: ref.id });
  return ref.id;
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

    await broadcast({
      kind: doc.get('kind') as AlertTaskKind,
      subjectUserId: doc.get('subjectUserId') as string,
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
