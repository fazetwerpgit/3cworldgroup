import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const retryPendingChatEvidence = vi.hoisted(() => vi.fn(async () => ({ checked: 2, saved: 1, failed: 1 })));
vi.mock('@/lib/chat/evidence', () => ({ retryPendingChatEvidence }));

const sweepAbandonedChatUploads = vi.hoisted(() => vi.fn(async () => ({ scanned: 3, deleted: 2, failed: 0 })));
vi.mock('@/lib/chat/pendingSweep', () => ({ sweepAbandonedChatUploads }));

import { GET } from './route';

const SECRET = 'test-cron-secret';
const request = (auth = `Bearer ${SECRET}`) =>
  new Request('http://localhost/api/cron/chat-evidence', { headers: { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  holder.db = {};
});

describe('GET /api/cron/chat-evidence', () => {
  it('turns away a caller without the cron secret', async () => {
    const response = await GET(request('Bearer wrong'));
    expect(response.status).toBe(401);
    expect(retryPendingChatEvidence).not.toHaveBeenCalled();
    expect(sweepAbandonedChatUploads).not.toHaveBeenCalled();
  });

  it('runs the sweep and reports the counts', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      checked: 2,
      saved: 1,
      failed: 1,
      pendingUploads: { scanned: 3, deleted: 2, failed: 0 },
    });
  });

  it('still answers 200 with the evidence counts when the pending sweep fails', async () => {
    sweepAbandonedChatUploads.mockRejectedValueOnce(new Error('storage down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, checked: 2, pendingUploads: { error: 'pending sweep failed' } });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('answers 500 when the sweep itself fails', async () => {
    retryPendingChatEvidence.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 14 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(request());
      expect(response.status).toBe(500);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
