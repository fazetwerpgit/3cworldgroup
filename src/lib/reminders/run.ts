import { dispatchToUser, type DispatchInput } from '@/lib/alerts/dispatch';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { gatherAllReps } from '@/lib/weeklyInstalls/gather';
import { reminderPush, tomorrowInstalls, tomorrowKey, type EveInstall } from './installEve';

// The 6 PM send. Per rep: tomorrow's installs, a claim on each sale, one push
// (bell + push, no email) for what was claimed. On by default (Jacob: automatic).
// Resumable: the 7 PM slot re-runs and reminds only sales whose claim never
// finished (failed, or stuck `claimed` past STALE_REMINDER_MS).
//
//   INSTALL_REMINDERS_OFF      "true" stops every send; the run becomes a dry
//                              run that reports what WOULD go out.
//   INSTALL_REMINDERS_ONLY_TO  optional; one rep's uid or email. Only that rep
//                              is reminded (a test run). Set but not one uid or
//                              one address (a typo, a list) forces a dry run:
//                              it must never fall back to every rep.

export interface ReminderRunConfig {
  enabled: boolean;
  onlyTo: string | null;
  /** Why the run was forced dry (a malformed ONLY_TO). */
  configError: string | null;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UID = /^[A-Za-z0-9_-]{6,128}$/;

export const ONLY_TO_INVALID =
  'INSTALL_REMINDERS_ONLY_TO is set but is not one uid or one email address, so nothing was sent. Fix it, or clear it for the live send to every rep.';

export function reminderRunConfig(env: NodeJS.ProcessEnv = process.env): ReminderRunConfig {
  const onlyTo = (env.INSTALL_REMINDERS_ONLY_TO ?? '').trim();
  if (onlyTo && !EMAIL.test(onlyTo) && !UID.test(onlyTo)) {
    return { enabled: false, onlyTo: null, configError: ONLY_TO_INVALID };
  }
  return { enabled: env.INSTALL_REMINDERS_OFF !== 'true', onlyTo: onlyTo || null, configError: null };
}

export interface ReminderPreview {
  uid: string;
  name: string;
  installs: number;
  title: string;
  message: string;
  link: string;
}

export interface ReminderRunSummary {
  forDate: string;
  enabled: boolean;
  onlyTo: string | null;
  configError?: string;
  /** Active reps with any sales or carrier orders (after ONLY_TO). */
  considered: number;
  /** Reps with at least one install tomorrow. */
  reps: number;
  installs: number;
  /** Dry run: what each rep would get. Live: what was sent. */
  pushes: ReminderPreview[];
  sent: number;
  /** Reps whose installs were all reminded already (a retry, the other slot). */
  alreadySent: number;
  failed: number;
}

export interface ReminderRunDeps {
  db: FirebaseFirestore.Firestore;
  now: Date;
  config: ReminderRunConfig;
  dispatch?: (input: DispatchInput) => Promise<void>;
}

/** A claim whose push never landed is retried after this long (the run died mid-send). */
export const STALE_REMINDER_MS = 15 * 60 * 1000;
export const MAX_REMINDER_ATTEMPTS = 3;

interface ReminderMark {
  forDate?: unknown;
  at?: unknown;
  /** 'claimed' until the push is dispatched, then 'sent'; 'failed' when it threw. Absent on old marks = sent. */
  state?: unknown;
  attempts?: unknown;
}

/**
 * Whether a sale may be claimed for `forDate`: never reminded for that day, or
 * a claim for it that never finished (failed, or `claimed` for longer than
 * STALE_REMINDER_MS), under the attempt cap. Pure, for the tests.
 */
export function reminderClaimable(mark: ReminderMark | undefined, forDate: string, now: Date): boolean {
  if (!mark || mark.forDate !== forDate) return true;
  const attempts = typeof mark.attempts === 'number' ? mark.attempts : 1;
  if (attempts >= MAX_REMINDER_ATTEMPTS) return false;
  if (mark.state === 'failed') return true;
  if (mark.state === 'claimed') {
    const at = typeof mark.at === 'string' ? Date.parse(mark.at) : NaN;
    return Number.isFinite(at) && now.getTime() - at >= STALE_REMINDER_MS;
  }
  return false;
}

/**
 * Marks the sale claimed for `forDate`, unless a run already reminded it. The
 * transaction makes two overlapping runs remind once; keying on the day means
 * a reschedule to a new day is reminded again. A claim left unfinished by a
 * dead run is taken over by the resume pass (reminderClaimable).
 */
async function claimReminder(db: FirebaseFirestore.Firestore, saleId: string, forDate: string, now: Date) {
  const ref = db.collection('sales').doc(saleId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const mark = snapshot.get('installReminder') as ReminderMark | undefined;
    if (!reminderClaimable(mark, forDate, now)) return false;
    const attempts = mark?.forDate === forDate ? (typeof mark.attempts === 'number' ? mark.attempts : 1) + 1 : 1;
    transaction.update(ref, { installReminder: { forDate, at: now.toISOString(), state: 'claimed', attempts } });
    return true;
  });
}

/** Records how the push for claimed sales ended. Fail-soft: a lost mark only means a stale-claim retry. */
async function markReminders(
  db: FirebaseFirestore.Firestore,
  saleIds: string[],
  forDate: string,
  claimedAt: Date,
  state: 'sent' | 'failed'
) {
  await Promise.all(
    saleIds.map(async (saleId) => {
      const ref = db.collection('sales').doc(saleId);
      try {
        const snapshot = await ref.get();
        const mark = snapshot.get('installReminder') as ReminderMark | undefined;
        if (mark?.forDate !== forDate || mark.at !== claimedAt.toISOString()) return; // another run owns it now
        await ref.update({ installReminder: { ...mark, state } });
      } catch (error) {
        console.error(`[install-reminders] failed to mark sale ${saleId} ${state}`, error);
      }
    })
  );
}

export async function runInstallReminders(deps: ReminderRunDeps): Promise<ReminderRunSummary> {
  const { db, now, config } = deps;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const forDate = tomorrowKey(now);
  const summary: ReminderRunSummary = {
    forDate,
    enabled: config.enabled,
    onlyTo: config.onlyTo,
    considered: 0,
    reps: 0,
    installs: 0,
    pushes: [],
    sent: 0,
    alreadySent: 0,
    failed: 0,
  };
  if (config.configError) {
    console.error(`[install-reminders] ${config.configError}`);
    summary.configError = config.configError;
  }

  const onlyTo = config.onlyTo?.toLowerCase() ?? null;
  const reps = (await gatherAllReps(db)).filter(
    (rep) => !onlyTo || rep.uid.toLowerCase() === onlyTo || rep.email?.toLowerCase() === onlyTo
  );
  summary.considered = reps.length;

  for (const rep of reps) {
    const fiberBySale = matchFiberOrdersToSales(rep.sales, rep.orders);
    const installs = tomorrowInstalls(applyCarrierInstallDates(rep.sales, fiberBySale), fiberBySale, now);
    if (!installs.length) continue;
    summary.reps += 1;
    summary.installs += installs.length;

    // Kill switch: off (or a bad config) means a read-only dry run. No claim, no send.
    if (!config.enabled || config.configError) {
      summary.pushes.push(preview(rep, installs));
      continue;
    }

    // Claim before sending: a claim that fails sends nothing, so a rep can miss
    // a reminder but never gets the same one twice.
    const claimed: EveInstall[] = [];
    let claimFailed = false;
    for (const install of installs) {
      try {
        if (await claimReminder(db, install.saleId, forDate, now)) claimed.push(install);
      } catch (error) {
        console.error(`[install-reminders] failed to claim sale ${install.saleId}`, error);
        claimFailed = true;
      }
    }
    if (!claimed.length) {
      if (claimFailed) summary.failed += 1;
      else summary.alreadySent += 1;
      continue;
    }

    const push = preview(rep, claimed);
    try {
      await dispatch({
        userId: rep.uid,
        type: 'install_reminder',
        title: push.title,
        message: push.message,
        link: push.link,
        metadata: { forDate, saleIds: claimed.map((install) => install.saleId) },
      });
      summary.pushes.push(push);
      summary.sent += 1;
      await markReminders(db, claimed.map((install) => install.saleId), forDate, now, 'sent');
    } catch (error) {
      console.error(`[install-reminders] failed to notify ${rep.uid}`, error);
      summary.failed += 1;
      await markReminders(db, claimed.map((install) => install.saleId), forDate, now, 'failed');
    }
  }

  return summary;
}

function preview(rep: { uid: string; name: string }, installs: EveInstall[]): ReminderPreview {
  return { uid: rep.uid, name: rep.name, installs: installs.length, ...reminderPush(installs) };
}
