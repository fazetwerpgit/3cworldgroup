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

function dateText(value: unknown): string {
  return asDate(value)?.toISOString() ?? '—';
}

function displayRole(value: unknown): string | null {
  return typeof value === 'string' && value in RoleDisplayNames
    ? RoleDisplayNames[value as keyof typeof RoleDisplayNames]
    : null;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
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

function checklistLine(item: OnboardingItem, progress: Record<string, unknown> | undefined): string {
  return `${item.label}: ${String(progress?.status ?? 'not_started')}; submittedAt: ${dateText(progress?.submittedAt)}; reviewedAt: ${dateText(progress?.reviewedAt)}`;
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

    const profileLines = ['Rep profile:'];
    const profileFields: Array<[string, unknown, (value: unknown) => string | null]> = [
      ['Display name', user.displayName, (value) => typeof value === 'string' ? value : null],
      ['Email', user.email, (value) => typeof value === 'string' ? value : null],
      ['Phone', user.phone, (value) => typeof value === 'string' ? value : null],
      ['Field role', displayRole(user.fieldRole), (value) => typeof value === 'string' ? value : null],
      ['IBO', user.isIBO, (value) => typeof value === 'boolean' ? String(value) : null],
      ['Created at', user.createdAt, (value) => asDate(value)?.toISOString() ?? null],
    ];
    profileFields.forEach(([label, value, format]) => {
      const rendered = format(value);
      if (rendered) profileLines.push(`${label}: ${rendered}`);
    });

    const sensitive = await adminDb.doc(`userSensitive/${opts.userId}`).get();
    const sensitiveData = sensitive.data?.() ?? {};
    const sensitiveLines = ['Sensitive fields (masked):'];
    if (typeof sensitiveData.ssnLast4 === 'string' && sensitiveData.ssnLast4) {
      sensitiveLines.push(`SSN: ***-**-${sensitiveData.ssnLast4.slice(-4)}`);
    }
    if (typeof sensitiveData.dlLast4 === 'string' && sensitiveData.dlLast4) {
      sensitiveLines.push(`DL: ********${sensitiveData.dlLast4.slice(-4)}`);
    }
    sensitiveLines.push('Full values: portal → Admin → Users → reveal (audited).');

    const checklistLines = ['Onboarding checklist:', ...items.map((item) => checklistLine(item, progressByItem.get(item.id)))];
    const attachmentLines = ['Attachments:'];
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
          skipped.push(name);
          continue;
        }
        attachmentBytes += buffer.length;
        attachments.push({ name, contentBase64: buffer.toString('base64'), contentType: 'application/pdf' });
      } catch (error) {
        skipped.push(`${name} (download failed)`);
        console.error('[onboarding owner notify] attachment download failed', { path, error });
      }
    }
    if (skipped.length) attachmentLines.push(`Skipped attachments: ${skipped.join(', ')}`);
    else attachmentLines.push('Stored signed PDFs are attached. Uploaded photos and W-9 remain available from the admin page.');
    attachmentLines.push(`Admin page: ${PACKET_URL()}`);

    const textBody = [
      ...profileLines,
      '',
      ...checklistLines,
      '',
      ...sensitiveLines,
      '',
      ...attachmentLines,
    ].join('\n');
    const htmlBody = `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${htmlEscape(textBody)}</pre>`;
    await sendToRecipients({
      ...onboardingPacketEmail({ repName: String(user.displayName || user.email || opts.userId), textBody, htmlBody }),
      attachments,
    });
  } catch (error) {
    console.error('[onboarding owner notify] packet failed', { userId: opts.userId, error });
  }
}
