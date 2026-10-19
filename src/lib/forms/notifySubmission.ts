import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email/sendEmail';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { appBaseUrl, formSubmissionEmail } from '@/lib/email/templates';
import { MANAGEMENT_PLATFORM_ROLES, isManagementRole, resolveRoles } from '@/types';

// Per-form alert config. Each rebuilt form has a stable key; the label + review
// link drive the notification text and deep-link. Adding a form here is all it
// takes to give it submission alerts.
export interface FormAlertMeta {
  key: string;
  label: string;
  reviewLink: string;
}

export const FORM_ALERTS: Record<string, FormAlertMeta> = {
  'fiber-report': { key: 'fiber-report', label: 'Fiber Report', reviewLink: '/portal/admin/requests?type=fiber-reports' },
  'expedite-order': { key: 'expedite-order', label: 'Expedite Order', reviewLink: '/portal/admin/requests?type=expedite-orders' },
  'payroll-dispute': { key: 'payroll-dispute', label: 'Payroll Dispute', reviewLink: '/portal/admin/requests?type=payroll-disputes' },
  'leads-request': { key: 'leads-request', label: 'Leads Request', reviewLink: '/portal/admin/requests?type=leads-requests' },
  'manager-interview': { key: 'manager-interview', label: 'Manager Interview', reviewLink: '/portal/admin/requests?type=manager-interviews' },
  'application': { key: 'application', label: 'Job Application', reviewLink: '/portal/admin/onboarding?tab=recruits' },
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

// Every active management user — the people who work the review queues.
// Deactivated accounts lost access, so they get no alerts either.
//
// A management role is only ever stored in the raw `role` field (resolveRoles
// reads platform roles from there alone), so a where('role','in',...) query
// returns exactly the docs the old whole-collection read kept. That read cost
// one read per user on every public job application (P2-5); this costs one per
// back-office user. Single-field index only; status is filtered in code.
export async function activeManagementUsers(): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (!adminDb) return [];
  const snap = await adminDb.collection('users').where('role', 'in', [...MANAGEMENT_PLATFORM_ROLES]).get();
  return snap.docs.filter((d) => {
    const data = d.data();
    const { role } = resolveRoles(data.role, data.fieldRole);
    return data.status === 'active' && isManagementRole(role);
  });
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
    const users = await activeManagementUsers();
    const uids = users.map((d) => d.id);
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
        users.map(async (user) => {
          // The query above already holds each doc; no second read per user.
          const to = emailFromUserDoc(user);
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
