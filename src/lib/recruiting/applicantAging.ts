// Website applicants stop counting as "waiting on you" after 30 days (Jacob,
// Oct 2026): Hiring > To do folds them into "Older applicants" and they add to
// no badge. One rule for To do, the Hiring tab count and the Admin nav badge
// (opsQueues), so the figures never disagree.

export const APPLICANT_FRESH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Applied within the last 30 days. An application with no readable date is treated as older. */
export function isFreshApplicant(createdAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const at = new Date(createdAt).getTime();
  if (Number.isNaN(at)) return false;
  return now - at <= APPLICANT_FRESH_DAYS * DAY_MS;
}

/** A website application nobody has invited or turned down yet. */
export function isWaitingApplication(application: { status?: string | null }): boolean {
  return application.status === 'applied';
}

/** Waiting on you: not handled yet and applied within the last 30 days. */
export function countsAsWaitingApplicant(
  application: { status?: string | null; createdAt?: Date | string | null },
  now = Date.now()
): boolean {
  return isWaitingApplication(application) && isFreshApplicant(application.createdAt, now);
}
