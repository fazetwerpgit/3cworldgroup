// One short doc per cron run in `cronRuns`, because Vercel Hobby keeps
// function logs for 30 minutes and every run's JSON summary was read by no one.
// `cronRuns/{job}_{YYYY-MM-DD}[_{slot}]` (UTC day): a retry of the same slot
// overwrites its own doc; the other DST slot gets its own. Server-only
// (firestore.rules has no client match for it).
//
// Fail-soft: recording a run never fails the run.

type Db = Pick<FirebaseFirestore.Firestore, 'collection'>;

export const CRON_RUNS = 'cronRuns';

export interface CronRunRecord {
  job: string;
  slot?: string | null;
  startedAt: Date;
  finishedAt?: Date;
  ok: boolean;
  summary?: unknown;
  error?: unknown;
}

const SAFE_SEGMENT = /[^A-Za-z0-9_-]+/g;

export function cronRunId(job: string, slot: string | null | undefined, startedAt: Date): string {
  const day = startedAt.toISOString().slice(0, 10);
  const clean = (value: string) => value.replace(SAFE_SEGMENT, '-');
  return slot ? `${clean(job)}_${day}_${clean(slot)}` : `${clean(job)}_${day}`;
}

/**
 * Keeps a summary small and free of people: scalars stay, arrays become their
 * length (lists of uids, names or pushes never land in the log), nested
 * objects are compacted one more level, then dropped.
 */
export function compactSummary(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 300);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') {
    if (depth >= 2) return null;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = compactSummary(item, depth + 1);
    }
    return out;
  }
  return null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

export async function recordCronRun(db: Db | null | undefined, run: CronRunRecord): Promise<void> {
  if (!db) return;
  try {
    const finishedAt = run.finishedAt ?? new Date();
    await db
      .collection(CRON_RUNS)
      .doc(cronRunId(run.job, run.slot, run.startedAt))
      .set({
        job: run.job,
        slot: run.slot ?? null,
        startedAt: run.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - run.startedAt.getTime(),
        ok: run.ok,
        summary: compactSummary(run.summary ?? null),
        ...(run.error !== undefined ? { error: errorText(run.error) } : {}),
      });
  } catch (error) {
    console.error(`[cron] run log not written for ${run.job}`, error);
  }
}

/**
 * Runs a cron body and records it. The body returns the summary it already
 * responds with; a throw is recorded (ok: false) and rethrown, so the route
 * answers exactly as before.
 */
export async function withCronRun<T>(
  db: Db | null | undefined,
  job: string,
  request: Request,
  body: () => Promise<T>,
  okOf: (summary: T) => boolean = () => true
): Promise<T> {
  const startedAt = new Date();
  let slot: string | null = null;
  try {
    slot = new URL(request.url).searchParams.get('slot');
  } catch {
    slot = null;
  }
  try {
    const summary = await body();
    let ok = true;
    try {
      ok = okOf(summary);
    } catch {
      ok = true;
    }
    await recordCronRun(db, { job, slot, startedAt, ok, summary });
    return summary;
  } catch (error) {
    await recordCronRun(db, { job, slot, startedAt, ok: false, error });
    throw error;
  }
}
