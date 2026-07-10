import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, formSubmissionEmail } from '@/lib/email/templates';
import { resolveRoles } from '@/types';

// Per-form alert config. Each rebuilt form has a stable key; the label + review
// link drive the notification text and deep-link. Adding a form here is all it
// takes to give it submission alerts.
export interface FormAlertMeta {
  key: string;
  label: string;
  reviewLink: string;
}

export const FORM_ALERTS: Record<string, FormAlertMeta> = {
  'fiber-report': { key: 'fiber-report', label: 'Fiber Report', reviewLink: '/portal/admin/fiber-reports' },
  'expedite-order': { key: 'expedite-order', label: 'Expedite Order', reviewLink: '/portal/admin/expedite-orders' },
  'payroll-dispute': { key: 'payroll-dispute', label: 'Payroll Dispute', reviewLink: '/portal/admin/payroll-disputes' },
  'leads-request': { key: 'leads-request', label: 'Leads Request', reviewLink: '/portal/admin/leads-requests' },
  'manager-interview': { key: 'manager-interview', label: 'Manager Interview', reviewLink: '/portal/admin/manager-interviews' },
};

// Whether alerts are enabled for a form. Stored in Firestore formAlerts/{key} with
// { enabled: boolean }; DEFAULT ON when the doc is missing. Admin toggles flip it.
async function alertsEnabled(key: string): Promise<boolean> {
  if (!adminDb) return false;
  try {
    const doc = await adminDb.collection('formAlerts').doc(key).get();
    if (!doc.exists) return true; // default on
    return doc.data()?.enabled !== false;
  } catch {
    return true;
  }
}

// The UIDs of every admin/operations user — the people who work the review queues.
async function managementUids(): Promise<string[]> {
  if (!adminDb) return [];
  const snap = await adminDb.collection('users').get();
  return snap.docs
    .filter((d) => {
      const data = d.data();
      const { role } = resolveRoles(data.role, data.fieldRole);
      return role === 'admin' || role === 'operations';
    })
    .map((d) => d.id);
}

// Fire in-portal bell notifications to admins + operations when a form is submitted.
// Best-effort: any failure here must NEVER fail the submission itself, so callers
// invoke this after the record is written and do not await its errors fatally.
export async function notifySubmission(formKey: string, submittedBy: string): Promise<void> {
  if (!adminDb) return;
  const meta = FORM_ALERTS[formKey];
  if (!meta) return;
  try {
    if (!(await alertsEnabled(formKey))) return;
    const uids = await managementUids();
    const now = new Date();
    await Promise.all(
      uids.map((uid) =>
        adminDb!.collection('notifications').add({
          userId: uid,
          type: 'system',
          title: `New ${meta.label}`,
          message: `${submittedBy || 'A team member'} submitted a ${meta.label}.`,
          link: meta.reviewLink,
          metadata: { formKey },
          read: false,
          createdAt: now,
        })
      )
    );

    try {
      const email = formSubmissionEmail({
        formName: meta.label,
        submittedBy,
        link: `${appBaseUrl()}${meta.reviewLink}`,
      });
      const results = await Promise.allSettled(
        uids.map(async (uid) => {
          const user = await adminDb!.collection('users').doc(uid).get();
          const to = user.get('email') as string | undefined;
          if (!to) return;

          const result = await sendEmail({ to, ...email });
          if (!result.ok) {
            console.error(`[forms] failed to email ${formKey} submission alert to ${to}:`, result.error);
          }
        })
      );
      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.error(`[forms] failed to send ${formKey} submission email alert:`, result.reason);
        }
      });
    } catch (err) {
      console.error(`Failed to send ${formKey} submission email alerts:`, err);
    }
  } catch (err) {
    console.error(`Failed to send ${formKey} submission alerts:`, err);
  }
}
