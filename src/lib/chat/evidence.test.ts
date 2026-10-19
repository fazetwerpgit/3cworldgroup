import { beforeEach, describe, expect, it, vi } from 'vitest';

// The sweep over chatEvidencePending (retryPendingChatEvidence).
const fake = vi.hoisted(() => {
  const pending = new Map<string, Record<string, unknown>>();
  const dead = new Map<string, Record<string, unknown>>();
  const queryLog: string[] = [];
  const reports = new Map<string, Record<string, unknown>>();
  const reportUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const storage = {
    copy: vi.fn<(from: string, to: string) => Promise<unknown>>(async () => [{}]),
    setMetadata: vi.fn<(path: string, meta: Record<string, unknown>) => Promise<unknown>>(async () => [{}]),
    delete: vi.fn<(path: string) => Promise<unknown>>(async () => [{}]),
  };
  const emptyQuery = { where: () => emptyQuery, get: async () => ({ docs: [] }) };
  const adminDb = {
    collection: (name: string) => {
      if (name === 'chatEvidencePending') {
        return {
          orderBy: (field: string) => (queryLog.push(`orderBy:${field}`), {
          limit: () => ({
            get: async () => ({
              docs: [...pending.entries()]
                .sort(([, a], [, b]) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
                .map(([id, data]) => ({
                id,
                data: () => data,
                ref: {
                  id,
                  delete: async () => {
                    if (data.failDelete) throw new Error('delete failed');
                    pending.delete(id);
                  },
                  set: async (patch: Record<string, unknown>) => {
                    pending.set(id, { ...pending.get(id), ...patch });
                  },
                },
              })),
            }),
          }),
          }),
        };
      }
      if (name === 'chatEvidenceDead') {
        return { doc: (id: string) => ({ set: async (data: Record<string, unknown>) => void dead.set(id, data) }) };
      }
      if (name === 'chatReports') {
        return {
          where: (_f: string, _op: string, messageId: string) => ({
            get: async () => ({
              docs: [...reports.entries()]
                .filter(([, d]) => d.messageId === messageId)
                .map(([id, d]) => ({ id, ref: { id }, data: () => d })),
            }),
          }),
        };
      }
      // chatChannels/{c}/messages: no other message shares the upload.
      return { doc: () => ({ collection: () => emptyQuery }) };
    },
    batch: () => {
      const queued: Array<{ id: string; data: Record<string, unknown> }> = [];
      return {
        update: (ref: { id: string }, data: Record<string, unknown>) => queued.push({ id: ref.id, data }),
        commit: async () => {
          reportUpdates.push(...queued);
        },
      };
    },
  };
  return { pending, dead, queryLog, reports, reportUpdates, storage, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: fake.adminDb,
  getOnboardingBucket: () => ({
    file: (path: string) => ({
      name: path,
      copy: (dest: { name: string }) => fake.storage.copy(path, dest.name),
      setMetadata: (meta: Record<string, unknown>) => fake.storage.setMetadata(path, meta),
      delete: () => fake.storage.delete(path),
    }),
  }),
}));

import { retryPendingChatEvidence } from './evidence';

beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-bucket';
  fake.pending.clear();
  fake.dead.clear();
  fake.queryLog.length = 0;
  fake.reports.clear();
  fake.reportUpdates.length = 0;
  fake.storage.copy.mockReset().mockResolvedValue([{}]);
  fake.storage.setMetadata.mockReset().mockResolvedValue([{}]);
  fake.storage.delete.mockReset().mockResolvedValue([{}]);
});

const pendingDoc = (overrides: Record<string, unknown> = {}) => ({
  path: 'chat/all-company/doc.pdf',
  reportId: 'm1_rep-a',
  createdAt: new Date(),
  channelId: 'all-company',
  messageId: 'm1',
  deletePaths: ['chat/all-company/doc.pdf', 'chat/all-company/doc-thumb.webp'],
  ...overrides,
});

describe('retryPendingChatEvidence', () => {
  it('copies the upload, points the reports at it, deletes the originals and drops the doc', async () => {
    fake.pending.set('all-company_m1', pendingDoc());
    fake.reports.set('m1_rep-a', { messageId: 'm1', channelId: 'all-company' });
    fake.reports.set('m1_rep-z', { messageId: 'm1', channelId: 'other' });

    expect(await retryPendingChatEvidence()).toEqual({ checked: 1, saved: 1, failed: 0, dead: 0 });
    const evidencePath = 'moderation/chat-reports/all-company/m1/doc.pdf';
    expect(fake.storage.copy).toHaveBeenCalledWith('chat/all-company/doc.pdf', evidencePath);
    expect(fake.storage.setMetadata).toHaveBeenCalledWith(evidencePath, { metadata: { firebaseStorageDownloadTokens: null } });
    expect(fake.reportUpdates.map((u) => [u.id, u.data.evidencePath])).toEqual([['m1_rep-a', evidencePath]]);
    expect(fake.storage.delete.mock.calls.map(([p]) => p).sort()).toEqual([
      'chat/all-company/doc-thumb.webp',
      'chat/all-company/doc.pdf',
    ]);
    expect(fake.storage.copy.mock.invocationCallOrder[0]).toBeLessThan(fake.storage.delete.mock.invocationCallOrder[0]);
    expect(fake.pending.size).toBe(0);
  });

  it('keeps the doc and the originals when the copy fails again', async () => {
    fake.pending.set('all-company_m1', pendingDoc());
    fake.reports.set('m1_rep-a', { messageId: 'm1', channelId: 'all-company' });
    fake.storage.copy.mockRejectedValue(Object.assign(new Error('copy failed'), { code: 503 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await retryPendingChatEvidence()).toEqual({ checked: 1, saved: 0, failed: 1, dead: 0 });
    } finally {
      errorSpy.mockRestore();
    }
    expect(fake.storage.delete).not.toHaveBeenCalled();
    expect(fake.pending.get('all-company_m1')).toMatchObject({ lastErrorCode: '503' });
  });

  it('just deletes the upload when no report is left on the message', async () => {
    fake.pending.set('all-company_m1', pendingDoc({ reportId: null, deletePaths: ['chat/all-company/doc.pdf'] }));
    expect(await retryPendingChatEvidence()).toEqual({ checked: 1, saved: 1, failed: 0, dead: 0 });
    expect(fake.storage.copy).not.toHaveBeenCalled();
    expect(fake.storage.delete.mock.calls.map(([p]) => p)).toEqual(['chat/all-company/doc.pdf']);
    expect(fake.pending.size).toBe(0);
  });

  it('drops a malformed doc without touching Storage outside the channel folder', async () => {
    fake.pending.set('bad', pendingDoc({ path: 'onboarding/u1/id.png' }));
    await retryPendingChatEvidence();
    expect(fake.storage.copy).not.toHaveBeenCalled();
    expect(fake.storage.delete).not.toHaveBeenCalled();
    expect(fake.pending.size).toBe(0);
  });

  it('sweeps oldest first', async () => {
    await retryPendingChatEvidence();
    expect(fake.queryLog).toEqual(['orderBy:createdAt']);
  });

  it('moves a doc to chatEvidenceDead on its 5th failure, so it stops taking a slot', async () => {
    fake.pending.set('all-company_m1', pendingDoc({ attempts: 4 }));
    fake.reports.set('m1_rep-a', { messageId: 'm1', channelId: 'all-company' });
    fake.storage.copy.mockRejectedValue(Object.assign(new Error('copy failed'), { code: 503 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await retryPendingChatEvidence()).toEqual({ checked: 1, saved: 0, failed: 1, dead: 1 });
    } finally {
      errorSpy.mockRestore();
    }
    expect(fake.pending.size).toBe(0);
    expect(fake.dead.get('all-company_m1')).toMatchObject({ status: 'failed-permanent', attempts: 5, lastErrorCode: '503' });
  });

  it('moves a doc already at the cap without retrying it', async () => {
    fake.pending.set('all-company_m1', pendingDoc({ attempts: 5 }));
    expect(await retryPendingChatEvidence()).toEqual({ checked: 1, saved: 0, failed: 0, dead: 1 });
    expect(fake.storage.copy).not.toHaveBeenCalled();
    expect(fake.dead.has('all-company_m1')).toBe(true);
  });

  it('a malformed doc whose delete throws does not fail the sweep', async () => {
    fake.pending.set('bad', pendingDoc({ path: 'onboarding/u1/id.png', failDelete: true, createdAt: new Date(0) }));
    fake.pending.set('all-company_m1', pendingDoc({ reportId: null, deletePaths: ['chat/all-company/doc.pdf'] }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await retryPendingChatEvidence()).toMatchObject({ checked: 2, saved: 1, failed: 1 });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
