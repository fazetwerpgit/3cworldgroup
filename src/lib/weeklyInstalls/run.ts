import { sendEmail, type EmailInput } from '@/lib/email/sendEmail';
import { buildRepDigest, isDigestEmpty } from '@/lib/weeklyInstalls/digest';
import { gatherAllReps } from '@/lib/weeklyInstalls/gather';
import { emailBaseUrl, renderWeeklyInstallsEmail } from '@/lib/weeklyInstalls/render';
import { claimSend, recordSendResult, sendLogId } from '@/lib/weeklyInstalls/sendLog';
import { reportWeekFor, type ReportWeek } from '@/lib/weeklyInstalls/week';

// The Monday send. Kill switch first, then one digest per active rep, then a
// claimed, awaited send for each one that has something to say.
//
//   WEEKLY_INSTALLS_EMAIL_ENABLED  must be exactly "true" or nothing is sent and
//                                  nothing is written (a dry run reports what
//                                  WOULD go out).
//   WEEKLY_INSTALLS_EMAIL_ONLY_TO  optional; every send goes to this one address
//                                  instead of the rep (the owner's test run).

export interface WeeklyRunConfig {
  enabled: boolean;
  onlyTo: string | null;
  baseUrl: string;
}

export function weeklyRunConfig(env: NodeJS.ProcessEnv = process.env): WeeklyRunConfig {
  const onlyTo = (env.WEEKLY_INSTALLS_EMAIL_ONLY_TO ?? '').trim();
  return {
    enabled: env.WEEKLY_INSTALLS_EMAIL_ENABLED === 'true',
    onlyTo: onlyTo.includes('@') ? onlyTo : null,
    baseUrl: emailBaseUrl(env.APP_BASE_URL),
  };
}

export interface WeeklyRunSummary {
  week: { from: string; to: string };
  enabled: boolean;
  redirectedTo: string | null;
  /** Active reps with any sales or carrier orders at all. */
  considered: number;
  /** Reps whose digest had nothing in it (never emailed). */
  empty: number;
  /** Reps with something to say but no email address on file. */
  noEmail: number;
  /** Would be sent (dry run) or were attempted (live). */
  eligible: number;
  sent: number;
  alreadySent: number;
  failed: number;
}

export interface RunDeps {
  db: FirebaseFirestore.Firestore;
  now: Date;
  config: WeeklyRunConfig;
  send?: (input: EmailInput) => Promise<{ ok: boolean; error?: string }>;
  week?: ReportWeek;
}

export async function runWeeklyInstallsEmail(deps: RunDeps): Promise<WeeklyRunSummary> {
  const { db, now, config } = deps;
  const send = deps.send ?? sendEmail;
  const week = deps.week ?? reportWeekFor(now);

  const summary: WeeklyRunSummary = {
    week: { from: week.last.from, to: week.last.to },
    enabled: config.enabled,
    redirectedTo: config.onlyTo,
    considered: 0,
    empty: 0,
    noEmail: 0,
    eligible: 0,
    sent: 0,
    alreadySent: 0,
    failed: 0,
  };

  const reps = await gatherAllReps(db);
  summary.considered = reps.length;

  for (const rep of reps) {
    const digest = buildRepDigest({
      rep: { uid: rep.uid, name: rep.name },
      sales: rep.sales,
      orders: rep.orders,
      rates: rep.rates,
      week,
    });
    if (isDigestEmpty(digest)) {
      summary.empty += 1;
      continue;
    }
    const to = config.onlyTo ?? rep.email;
    if (!to) {
      summary.noEmail += 1;
      continue;
    }
    summary.eligible += 1;
    // Kill switch: off means a read-only dry run. No claim, no send.
    if (!config.enabled) continue;

    const email = renderWeeklyInstallsEmail(digest, { baseUrl: config.baseUrl });
    const subject = config.onlyTo ? `[Test: ${rep.name}] ${email.subject}` : email.subject;
    const logId = sendLogId(week.last.from, rep.uid, config.onlyTo);

    const claimed = await claimSend(
      db,
      logId,
      {
        weekFrom: week.last.from,
        weekTo: week.last.to,
        uid: rep.uid,
        repName: rep.name,
        to,
        redirected: !!config.onlyTo,
        subject,
        installs: digest.total.count,
      },
      now
    );
    if (!claimed) {
      summary.alreadySent += 1;
      continue;
    }

    // ALWAYS awaited: an un-awaited send is cut off when the function returns.
    const result = await send({ to, subject, htmlBody: email.html, textBody: email.text });
    await recordSendResult(db, logId, result, new Date());
    if (result.ok) summary.sent += 1;
    else summary.failed += 1;
  }

  return summary;
}
