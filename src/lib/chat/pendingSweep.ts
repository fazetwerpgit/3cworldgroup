import { getOnboardingBucket } from '@/lib/firebase/admin';
import { CHAT_PENDING_PREFIX, getChatStorageBucketName } from '@/lib/chat/media';

// Abandoned direct uploads: a client wrote chat-pending/{uid}/{id}.{ext} but
// never attached it (app closed, network dropped, send cancelled). The daily
// chat-evidence cron calls this to delete pending objects older than an hour.
// A GCS lifecycle rule (docs/ios-app/storage-lifecycle.json) is the backstop.

export const PENDING_MAX_AGE_MS = 60 * 60 * 1000;
export const PENDING_SWEEP_MAX_DELETES = 500;
export const PENDING_SWEEP_PAGE_SIZE = 500;
/** Bounds the listing too, so a folder full of fresh uploads can't stall the run. */
export const PENDING_SWEEP_MAX_PAGES = 10;

export type PendingSweepResult = {
  skipped?: 'storage-not-configured';
  scanned: number;
  deleted: number;
  failed: number;
};

type ListedFile = {
  name: string;
  metadata?: { timeCreated?: string; updated?: string };
  delete: (opts: { ignoreNotFound: boolean }) => Promise<unknown>;
};

function createdAt(file: ListedFile): number {
  const stamp = file.metadata?.timeCreated ?? file.metadata?.updated;
  const ms = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

export async function sweepAbandonedChatUploads(now: number = Date.now()): Promise<PendingSweepResult> {
  const result: PendingSweepResult = { scanned: 0, deleted: 0, failed: 0 };
  if (!getChatStorageBucketName()) return { ...result, skipped: 'storage-not-configured' };

  const bucket = getOnboardingBucket();
  const cutoff = now - PENDING_MAX_AGE_MS;
  let pageToken: string | undefined;

  for (let page = 0; page < PENDING_SWEEP_MAX_PAGES; page++) {
    const [files, nextQuery] = (await bucket.getFiles({
      prefix: `${CHAT_PENDING_PREFIX}/`,
      maxResults: PENDING_SWEEP_PAGE_SIZE,
      autoPaginate: false,
      ...(pageToken ? { pageToken } : {}),
    })) as unknown as [ListedFile[], { pageToken?: string } | null | undefined];

    for (const file of files) {
      if (result.deleted + result.failed >= PENDING_SWEEP_MAX_DELETES) return result;
      result.scanned++;
      // Never touch anything outside the pending folder, and keep anything
      // young or undated: it may be an upload still on its way to attach.
      if (!file.name.startsWith(`${CHAT_PENDING_PREFIX}/`)) continue;
      const created = createdAt(file);
      if (!Number.isFinite(created) || created > cutoff) continue;
      try {
        await file.delete({ ignoreNotFound: true });
        result.deleted++;
      } catch (error) {
        result.failed++;
        console.error('[chat pending sweep] delete failed', file.name, (error as { code?: unknown } | null)?.code ?? 'unknown');
      }
    }

    pageToken = nextQuery?.pageToken;
    if (!pageToken) break;
  }
  return result;
}
