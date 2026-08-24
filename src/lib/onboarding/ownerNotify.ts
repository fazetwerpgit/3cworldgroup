import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { onboardingFrom, sendEmail } from '@/lib/email/sendEmail';
import {
  appBaseUrl,
  onboardingPacketEmail,
  ownerDocSignedEmail,
} from '@/lib/email/templates';
import { RoleDisplayNames, type FieldRole } from '@/types/auth';
import { getOnboardingItemsForUser, type OnboardingItem } from '@/types/onboarding';

const PACKET_URL = () => `${appBaseUrl()}/portal/admin/onboarding`;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function emailValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email && email.includes('@') ? email : null;
}

function valueFromDoc(doc: { data?: () => Record<string, unknown> | undefined; get?: (field: string) => unknown }, field: string): unknown {
  return doc.data?.()?.[field] ?? doc.get?.(field);
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const PACKET_TZ = 'America/Chicago';

function dateText(value: unknown): string {
  const date = asDate(value);
  return date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: PACKET_TZ })
    : '—';
}

function statusText(value: unknown): string {
  const status = typeof value === 'string' && value ? value : 'not_started';
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function displayRole(value: unknown): string | null {
  return typeof value === 'string' && value in RoleDisplayNames
    ? RoleDisplayNames[value as keyof typeof RoleDisplayNames]
    : null;
}

export async function getOwnerRecipients(): Promise<string[]> {
  if (!adminDb) return [];
  try {
    const [owners, config] = await Promise.all([
      adminDb.collection('users').where('role', '==', 'owner').get(),
      adminDb.doc('config/onboardingNotifications').get(),
    ]);
    // Some legacy user docs store the address under 'Email' (capital E) —
    // read both so no owner is silently dropped from notifications.
    const raw = owners.docs.flatMap((doc) => [valueFromDoc(doc, 'email'), valueFromDoc(doc, 'Email')]);
    const extraEmails = valueFromDoc(config, 'extraEmails');
    if (Array.isArray(extraEmails)) raw.push(...extraEmails);

    const seen = new Set<string>();
    return raw.reduce<string[]>((result, value) => {
      const email = emailValue(value);
      const key = email?.toLowerCase();
      if (email && key && !seen.has(key)) {
        seen.add(key);
        result.push(email);
      }
      return result;
    }, []);
  } catch (error) {
    console.error('[onboarding owner notify] recipient lookup failed', error);
    return [];
  }
}

async function sendToRecipients(content: {
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments?: { name: string; contentBase64: string; contentType: string }[];
}): Promise<void> {
  const recipients = await getOwnerRecipients();
  await Promise.all(recipients.map(async (to) => {
    try {
      await sendEmail({ ...content, to, from: onboardingFrom() });
    } catch (error) {
      console.error('[onboarding owner notify] email failed', { to, subject: content.subject, error });
    }
  }));
}

export async function notifyDocSigned(opts: { userId: string; repName: string; itemLabel: string }): Promise<void> {
  try {
    await sendToRecipients(ownerDocSignedEmail({
      repName: opts.repName,
      itemLabel: opts.itemLabel,
      link: PACKET_URL(),
    }));
  } catch (error) {
    console.error('[onboarding owner notify] signed notification failed', { userId: opts.userId, error });
  }
}

function storageBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!adminStorage || !bucketName) throw new Error('Storage bucket is not configured');
  return adminStorage.bucket(bucketName);
}

function checklistRow(item: OnboardingItem, progress: Record<string, unknown> | undefined) {
  return {
    label: item.label,
    status: statusText(progress?.status),
    submitted: dateText(progress?.submittedAt),
    reviewed: dateText(progress?.reviewedAt),
  };
}

export async function sendOnboardingPacket(opts: { userId: string }): Promise<void> {
  try {
    if (!adminDb) return;
    const userDoc = await adminDb.doc(`users/${opts.userId}`).get();
    const user = userDoc.data?.() ?? {};
    const fieldRole = user.fieldRole as FieldRole | undefined;
    const items = fieldRole ? getOnboardingItemsForUser(fieldRole, user.isIBO === true) : [];
    const progressSnap = await adminDb.collection('userOnboarding').where('userId', '==', opts.userId).get();
    const progressByItem = new Map<string, Record<string, unknown>>();
    progressSnap.docs.forEach((doc) => {
      const data = doc.data?.() ?? {};
      if (typeof data.itemId === 'string') progressByItem.set(data.itemId, data);
    });

    // Role carries the IBO flag so it does not need a row of its own; the flag
    // stays owner-facing only (it is hidden from rep UI).
    const role = displayRole(user.fieldRole);
    const profile: Array<[string, string]> = [];
    if (typeof user.email === 'string' && user.email) profile.push(['Email', user.email]);
    if (typeof user.phone === 'string' && user.phone) profile.push(['Phone', user.phone]);
    if (role) profile.push(['Role', user.isIBO === true ? `${role} · IBO` : role]);
    if (asDate(user.createdAt)) profile.push(['Joined', dateText(user.createdAt)]);

    const sensitive = await adminDb.doc(`userSensitive/${opts.userId}`).get();
    const sensitiveData = sensitive.data?.() ?? {};
    const masked: Array<[string, string]> = [];
    if (typeof sensitiveData.ssnLast4 === 'string' && sensitiveData.ssnLast4) {
      masked.push(['SSN', `***-**-${sensitiveData.ssnLast4.slice(-4)}`]);
    }
    if (typeof sensitiveData.dlLast4 === 'string' && sensitiveData.dlLast4) {
      masked.push(['DL', `********${sensitiveData.dlLast4.slice(-4)}`]);
    }

    const checklist = items.map((item) => checklistRow(item, progressByItem.get(item.id)));
    const skipped: string[] = [];
    const attachments: { name: string; contentBase64: string; contentType: string }[] = [];
    let attachmentBytes = 0;
    let bucket: ReturnType<typeof storageBucket> | undefined;
    for (const [itemId, progress] of progressByItem) {
      const path = progress.completedPdfPath;
      if (typeof path !== 'string' || !path) continue;
      const name = path.split('/').pop() || `${itemId}.pdf`;
      try {
        bucket ??= storageBucket();
        const [buffer] = await bucket.file(path).download();
        if (attachmentBytes + buffer.length > MAX_ATTACHMENT_BYTES) {
          skipped.push(`${name} (over the 8MB email limit)`);
          continue;
        }
        attachmentBytes += buffer.length;
        attachments.push({ name, contentBase64: buffer.toString('base64'), contentType: 'application/pdf' });
      } catch (error) {
        skipped.push(`${name} (download failed)`);
        console.error('[onboarding owner notify] attachment download failed', { path, error });
      }
    }
    await sendToRecipients({
      ...onboardingPacketEmail({
        repName: String(user.displayName || user.email || opts.userId),
        completedOn: dateText(new Date()),
        profile,
        checklist,
        masked,
        attached: attachments.map((attachment) => attachment.name),
        skipped,
        link: PACKET_URL(),
      }),
      attachments,
    });
  } catch (error) {
    console.error('[onboarding owner notify] packet failed', { userId: opts.userId, error });
  }
}
