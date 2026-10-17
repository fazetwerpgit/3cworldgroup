import { beforeEach, describe, expect, it, vi } from 'vitest';

type Obj = { name: string; timeCreated?: string };
const store = vi.hoisted(() => ({ objects: [] as Obj[], deleted: [] as string[], failOn: new Set<string>() }));
const getFiles = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/admin', () => ({
  getOnboardingBucket: () => ({ getFiles }),
}));

import {
  PENDING_SWEEP_MAX_DELETES,
  PENDING_SWEEP_MAX_PAGES,
  PENDING_SWEEP_PAGE_SIZE,
  sweepAbandonedChatUploads,
} from './pendingSweep';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function asFile(obj: Obj) {
  return {
    name: obj.name,
    metadata: { timeCreated: obj.timeCreated },
    delete: vi.fn(async () => {
      if (store.failOn.has(obj.name)) throw Object.assign(new Error('nope'), { code: 403 });
      store.deleted.push(obj.name);
    }),
  };
}

// Pages the store like GCS: pageToken is the start index.
getFiles.mockImplementation(async (query: { prefix: string; maxResults: number; pageToken?: string }) => {
  const matching = store.objects.filter((o) => o.name.startsWith(query.prefix));
  const start = Number(query.pageToken ?? 0);
  const page = matching.slice(start, start + query.maxResults);
  const next = start + query.maxResults < matching.length ? { pageToken: String(start + query.maxResults) } : null;
  return [page.map(asFile), next, {}];
});

beforeEach(() => {
  store.objects = [];
  store.deleted = [];
  store.failOn.clear();
  getFiles.mockClear();
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test-bucket.appspot.com';
});

describe('sweepAbandonedChatUploads', () => {
  it('deletes pending objects older than an hour and keeps young or undated ones', async () => {
    store.objects = [
      { name: 'chat-pending/rep-1/old-upload-0001.pdf', timeCreated: minutesAgo(61) },
      { name: 'chat-pending/rep-2/older-upload-02.png', timeCreated: minutesAgo(60 * 30) },
      { name: 'chat-pending/rep-1/fresh-upload-03.pdf', timeCreated: minutesAgo(10) },
      { name: 'chat-pending/rep-3/undated-upload-4.pdf' },
      { name: 'chat/all-company/ancient-0000005.pdf', timeCreated: minutesAgo(60 * 24 * 90) },
    ];
    const result = await sweepAbandonedChatUploads(NOW);
    expect(store.deleted.sort()).toEqual([
      'chat-pending/rep-1/old-upload-0001.pdf',
      'chat-pending/rep-2/older-upload-02.png',
    ]);
    expect(result).toEqual({ scanned: 4, deleted: 2, failed: 0 });
    expect(getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'chat-pending/', maxResults: PENDING_SWEEP_PAGE_SIZE, autoPaginate: false })
    );
  });

  it('follows page tokens and stops at the per-run delete cap', async () => {
    const total = PENDING_SWEEP_MAX_DELETES + 120;
    store.objects = Array.from({ length: total }, (_, i) => ({
      name: `chat-pending/rep-1/upload-${String(i).padStart(6, '0')}.pdf`,
      timeCreated: minutesAgo(120),
    }));
    const result = await sweepAbandonedChatUploads(NOW);
    expect(result.deleted).toBe(PENDING_SWEEP_MAX_DELETES);
    expect(store.deleted).toHaveLength(PENDING_SWEEP_MAX_DELETES);
  });

  it('pages past young uploads, bounded by the page limit', async () => {
    const young = PENDING_SWEEP_PAGE_SIZE + 5;
    store.objects = [
      ...Array.from({ length: young }, (_, i) => ({
        name: `chat-pending/rep-1/young-${String(i).padStart(6, '0')}.pdf`,
        timeCreated: minutesAgo(5),
      })),
      { name: 'chat-pending/rep-9/old-upload-999.pdf', timeCreated: minutesAgo(90) },
    ];
    const result = await sweepAbandonedChatUploads(NOW);
    expect(getFiles).toHaveBeenCalledTimes(2);
    expect(store.deleted).toEqual(['chat-pending/rep-9/old-upload-999.pdf']);
    expect(result).toEqual({ scanned: young + 1, deleted: 1, failed: 0 });
    expect(getFiles.mock.calls.length).toBeLessThanOrEqual(PENDING_SWEEP_MAX_PAGES);
  });

  it('counts a failed delete and carries on', async () => {
    store.objects = [
      { name: 'chat-pending/rep-1/old-upload-0001.pdf', timeCreated: minutesAgo(120) },
      { name: 'chat-pending/rep-1/old-upload-0002.pdf', timeCreated: minutesAgo(120) },
    ];
    store.failOn.add('chat-pending/rep-1/old-upload-0001.pdf');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await sweepAbandonedChatUploads(NOW)).toEqual({ scanned: 2, deleted: 1, failed: 1 });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('skips when the storage bucket is not configured', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    expect(await sweepAbandonedChatUploads(NOW)).toEqual({
      scanned: 0,
      deleted: 0,
      failed: 0,
      skipped: 'storage-not-configured',
    });
    expect(getFiles).not.toHaveBeenCalled();
  });
});
