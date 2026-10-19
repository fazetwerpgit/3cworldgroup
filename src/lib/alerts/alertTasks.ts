import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { appBaseUrl, managerAlertEmail } from '@/lib/email/templates';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { isEsignItem } from '@/lib/onboarding/esign';
import { MANAGEMENT_PLATFORM_ROLES, roleRequiresOnboarding, type FieldRole } from '@/types/auth';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import { isHeldOnboardingItem } from '@/types/onboardingHold';
import type { AlertTaskKind } from '@/types/alerts';

const RENAG_MS = 24 * 3600 * 1000;

/**
 * review_needed titles raised by code that was removed with the old signing
 * vendor (4012b570). Nothing raises or resolves these any more, so an open one
 * would otherwise re-nag forever.
 */
const RETIRED_SIGNING_ALERT_TITLES: ReadonlySet<string> = new Set([
  'In-portal signing failed to load', // api/portal/onboarding/esign-embed-error
  'E-signature signing link missing', // vendor signing-URL fetch in esign/autoSend
  'E-signature identity mismatch needs attention', // vendor completion webhook
]);

/**
 * review_needed titles that are about e-signing. Alert tasks carry no item id
 * and dedupe on kind + subject, so one task can stand for several documents:
 * a signing alert is known by its title and is settled only once the rep has
 * nothing left to sign.
 */
const SIGNING_ALERT_TITLES: ReadonlySet<string> = new Set([
  'E-signature delivery needs attention', // esign/autoSend dispatch failure
  ...RETIRED_SIGNING_ALERT_TITLES,
]);

export function isSigningAlertTask(task: { kind: unknown; title: unknown }): boolean {
  return task.kind === 'review_needed' && typeof task.title === 'string' && SIGNING_ALERT_TITLES.has(task.title);
}

type FieldReader = { get: (field: string) => unknown };

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
  kinds?: AlertTaskKind[],
  options: { match?: (task: FieldReader) => boolean; reason?: string } = {}
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
      .filter((doc) => !options.match || options.match(doc))
      .map((doc) =>
        doc.ref.update({
          status: 'resolved',
          resolvedAt: now,
          ...(options.reason ? { resolvedReason: options.reason } : {}),
        })
      )
  );
}

/** title/message with every occurrence of `name` replaced; non-string fields are left out. */
function scrubbedText(doc: FieldReader, name: string, replacement: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ['title', 'message']) {
    const text = doc.get(field);
    if (typeof text === 'string') out[field] = name ? text.split(name).join(replacement) : text;
  }
  return out;
}

/**
 * After an account is deleted: re-stamps every alert task about the person
 * (any status) and every management notification copied from those tasks,
 * so the person's name (kept as subjectName and written into titles such as
 * "<name> self-registered…") no longer appears. The name stripped is each
 * task's own subjectName, so a retry after the profile is already anonymized
 * still works.
 */
export async function anonymizeAlertTasks(subjectUserId: string, replacement: string): Promise<void> {
  const db = requireDb();
  const snap = await db.collection('alertTasks').where('subjectUserId', '==', subjectUserId).get();

  const names = new Map<string, string>();
  await Promise.all(
    snap.docs.map((doc) => {
      const raw = doc.get('subjectName');
      const name = typeof raw === 'string' && raw !== replacement ? raw : '';
      if (name) names.set(doc.id, name);
      return doc.ref.update({ subjectName: replacement, ...scrubbedText(doc, name, replacement) });
    })
  );

  // Firestore 'in' takes at most 30 values.
  const taskIds = [...names.keys()];
  for (let i = 0; i < taskIds.length; i += 30) {
    const copies = await db
      .collection('notifications')
      .where('metadata.alertTaskId', 'in', taskIds.slice(i, i + 30))
      .get();
    await Promise.all(
      copies.docs.map((doc) => {
        const name = names.get(doc.get('metadata.alertTaskId') as string) ?? '';
        return doc.ref.update(scrubbedText(doc, name, replacement));
      })
    );
  }
}

/**
 * True while the rep has an e-sign document that is not signed: any e-sign row
 * on file that is not approved, or, while they are still onboarding, any e-sign
 * item on their checklist that is not approved. Held items are never signed, so
 * they never count.
 */
export async function hasOutstandingEsignItems(userId: string, user?: FieldReader): Promise<boolean> {
  const db = requireDb();
  const [userSnap, rows] = await Promise.all([
    user ?? db.collection('users').doc(userId).get(),
    db.collection('userOnboarding').where('userId', '==', userId).get(),
  ]);

  const statuses = new Map<string, unknown>();
  rows.docs.forEach((doc) => statuses.set(String(doc.get('itemId')), doc.get('status')));

  const required = new Set([...statuses.keys()].filter((id) => isEsignItem(id) && !isHeldOnboardingItem(id)));
  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (fieldRole && roleRequiresOnboarding(fieldRole)) {
    getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO'))
      .filter((item) => isEsignItem(item.id))
      .forEach((item) => required.add(item.id));
  }

  return [...required].some((id) => statuses.get(id) !== 'approved');
}

/**
 * Closes the rep's open/claimed e-sign review_needed tasks once every e-sign
 * document they owe is signed. Called after a signature is approved; the
 * re-nag cron applies the same rule to tasks that predate this.
 */
export async function resolveSigningAlertTasks(userId: string): Promise<void> {
  if (await hasOutstandingEsignItems(userId)) return;
  await resolveAlertTasks(userId, ['review_needed'], {
    match: (task) => isSigningAlertTask({ kind: task.get('kind'), title: task.get('title') }),
    reason: 'every e-sign document is signed',
  });
}

/** Why an open signing alert no longer needs anyone, or null while it still does. */
async function staleSigningAlertReason(
  title: string,
  subjectUserId: string,
  subject: FieldReader
): Promise<string | null> {
  if (RETIRED_SIGNING_ALERT_TITLES.has(title) && subject.get('status') === 'active') {
    return 'retired alert source (removed signing vendor) and the subject is active';
  }
  try {
    if (!(await hasOutstandingEsignItems(subjectUserId, subject))) {
      return 'every e-sign document is signed';
    }
  } catch (error) {
    // Unknown means keep nagging: a missed close costs an email, a wrong one hides work.
    console.error('[alertTasks] failed to check outstanding e-sign items', { subjectUserId, error });
  }
  return null;
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

    // A signing alert outlives its cause when the rep signs (or the source
    // that raised it is gone): close it rather than nag about finished work.
    const title = doc.get('title') as string;
    if (isSigningAlertTask({ kind: doc.get('kind'), title })) {
      const resolvedReason = await staleSigningAlertReason(title, subjectUserId, subject);
      if (resolvedReason) {
        await doc.ref.update({ status: 'resolved', resolvedAt: now, resolvedReason });
        continue;
      }
    }

    await broadcast({
      kind: doc.get('kind') as AlertTaskKind,
      subjectUserId,
      subjectName: doc.get('subjectName') as string,
      title: `Still unclaimed: ${title}`,
      message: doc.get('message') as string,
      link: doc.get('link') as string,
      id: doc.id,
    });
    await doc.ref.update({ lastNaggedAt: now });
    count += 1;
  }

  return count;
}
