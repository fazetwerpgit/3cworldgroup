import { after } from 'next/server';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { appBaseUrl, checklistReadyEmail } from '@/lib/email/templates';
import { onboardingFrom } from '@/lib/email/sendEmail';

// Starts onboarding for a pending user who now holds a role that requires it:
// clears the "needs a position" alert, sends the checklist-ready notification
// + email (awaited), then dispatches the e-sign envelopes after the response.
// Shared by the admin role-assignment PUT and admin user creation so both
// paths start the exact same checklist. Must run inside a request scope
// (`after`). Notification failures are logged, never thrown: the user record
// is already committed by the time this runs.
export async function kickoffOnboardingChecklist(
  userId: string,
  displayName: string,
  logPrefix = '[onboarding]'
): Promise<void> {
  try {
    await Promise.all([
      resolveAlertTasks(userId, ['pending_assignment']),
      dispatchToUser({
        userId,
        type: 'system',
        title: 'Your onboarding checklist is ready',
        message: 'Your position was assigned. Complete your checklist to go active.',
        link: '/portal/onboarding',
        email: checklistReadyEmail({
          name: displayName,
          portalUrl: `${appBaseUrl()}/portal/onboarding`,
        }),
        emailFrom: onboardingFrom(),
      }),
    ]);
  } catch (error) {
    console.error(`${logPrefix} checklist kickoff notification failed:`, error);
  }

  after(() =>
    sendPendingEsignDocs(userId).catch((err) =>
      console.error(`${logPrefix} esign kickoff failed`, err)
    )
  );
}
