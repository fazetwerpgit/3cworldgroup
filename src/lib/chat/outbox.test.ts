import { describe, it, expect } from 'vitest';
import {
  AUTO_RETRY_MAX_AGE_MS,
  OUTBOX_MAX_AGE_MS,
  RETRY_DELAYS_MS,
  SendRequestError,
  chatMessageDocId,
  classifySendError,
  decideAfterFailure,
  isRetryableFailure,
  isValidClientMessageId,
  newClientMessageId,
  parseOutbox,
  reconcileEchoes,
  toOutboxEntries,
} from './outbox';

const UID = 'uid-1';
const CID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NOW = Date.parse('2026-09-22T15:00:00Z');

describe('client message ids', () => {
  it('generates ids the server accepts, and they differ', () => {
    const a = newClientMessageId();
    const b = newClientMessageId();
    expect(isValidClientMessageId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('rejects anything that could escape the doc id', () => {
    expect(isValidClientMessageId('short')).toBe(false);
    expect(isValidClientMessageId('a/b/c/d/e/f/g/h/i/j/k')).toBe(false);
    expect(isValidClientMessageId('x'.repeat(65))).toBe(false);
    expect(isValidClientMessageId(42)).toBe(false);
    expect(isValidClientMessageId(undefined)).toBe(false);
  });

  it('scopes the doc id to the author', () => {
    expect(chatMessageDocId(UID, CID)).toBe(`${UID}_${CID}`);
    expect(chatMessageDocId('uid-2', CID)).not.toBe(chatMessageDocId(UID, CID));
  });
});

describe('retry policy', () => {
  it('retries network errors and transient statuses only', () => {
    expect(isRetryableFailure({ kind: 'network' })).toBe(true);
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableFailure({ kind: 'http', status })).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 413]) {
      expect(isRetryableFailure({ kind: 'http', status })).toBe(false);
    }
  });

  it('backs off through the schedule, then gives up', () => {
    RETRY_DELAYS_MS.forEach((delayMs, index) => {
      expect(decideAfterFailure({ failure: { kind: 'network' }, attempts: index + 1, ageMs: 0, online: true })).toEqual({
        action: 'retry',
        delayMs,
      });
    });
    expect(
      decideAfterFailure({ failure: { kind: 'network' }, attempts: RETRY_DELAYS_MS.length + 1, ageMs: 0, online: true })
    ).toEqual({ action: 'fail' });
  });

  it('waits for connectivity instead of a timer while offline', () => {
    expect(decideAfterFailure({ failure: { kind: 'network' }, attempts: 99, ageMs: 1000, online: false })).toEqual({
      action: 'wait-online',
    });
  });

  it('fails permanent errors and stale messages straight away', () => {
    expect(decideAfterFailure({ failure: { kind: 'http', status: 400 }, attempts: 1, ageMs: 0, online: true })).toEqual({
      action: 'fail',
    });
    expect(
      decideAfterFailure({ failure: { kind: 'network' }, attempts: 1, ageMs: AUTO_RETRY_MAX_AGE_MS, online: false })
    ).toEqual({ action: 'fail' });
  });
});

describe('reconcileEchoes', () => {
  const echo = (id: string, extra: Record<string, unknown> = {}) => ({ id, channelId: 'c1', ...extra });

  it('matches by doc id, never by text', () => {
    const echoes = [echo('uid-1_a'), echo('uid-1_b')];
    const { unreconciled, reconciledIds } = reconcileEchoes(new Set(['uid-1_a', 'random']), echoes, 'c1');
    expect(reconciledIds).toEqual(['uid-1_a']);
    expect(unreconciled.map((e) => e.id)).toEqual(['uid-1_b']);
  });

  it('resolves a failed echo whose POST actually landed', () => {
    const { unreconciled } = reconcileEchoes(new Set(['uid-1_a']), [echo('uid-1_a', { pendingState: 'failed' })], 'c1');
    expect(unreconciled).toEqual([]);
  });

  it('honours a server-reported id that differs from the echo id', () => {
    const { unreconciled } = reconcileEchoes(new Set(['legacy-id']), [echo('uid-1_a', { deliveredId: 'legacy-id' })], 'c1');
    expect(unreconciled).toEqual([]);
  });

  it('ignores echoes from other channels', () => {
    const result = reconcileEchoes(new Set(), [{ id: 'x', channelId: 'c2' }], 'c1');
    expect(result).toEqual({ unreconciled: [], reconciledIds: [] });
  });
});

describe('outbox persistence', () => {
  const base = {
    id: chatMessageDocId(UID, CID),
    clientMessageId: CID,
    channelId: 'c1',
    text: 'on my way',
    authorId: UID,
    authorName: 'Rep One',
    createdAt: new Date(NOW - 1000),
    pendingState: 'sending' as const,
  };

  it('round-trips an unsent text message', () => {
    const entries = toOutboxEntries([base]);
    const restored = parseOutbox(JSON.stringify(entries), UID, NOW);
    expect(restored).toEqual([
      {
        id: base.id,
        clientMessageId: CID,
        channelId: 'c1',
        text: 'on my way',
        authorId: UID,
        authorName: 'Rep One',
        createdAt: NOW - 1000,
        failed: false,
      },
    ]);
  });

  it('skips delivered echoes, echoes without a client id, and photos not yet uploaded', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(
      toOutboxEntries([
        { ...base, deliveredId: base.id },
        { ...base, clientMessageId: undefined },
        { ...base, text: '', pendingFile: file },
      ])
    ).toEqual([]);
  });

  it('keeps an uploaded photo by its server URL', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const uploaded = { type: 'image' as const, url: 'https://storage/x.jpg', width: 10, height: 20 };
    const [entry] = toOutboxEntries([{ ...base, text: '', pendingFile: file, uploadedAttachment: uploaded }]);
    expect(entry.attachment).toEqual(uploaded);
  });

  it('drops malformed rows, other users, and very old rows', () => {
    const good = toOutboxEntries([base])[0];
    const raw = JSON.stringify([
      good,
      { ...good, id: 'uid-2_x', authorId: 'uid-2' },
      { ...good, id: 'not-derived' },
      { ...good, createdAt: NOW - OUTBOX_MAX_AGE_MS - 1 },
      { ...good, text: '' },
      null,
      'junk',
      good,
    ]);
    expect(parseOutbox(raw, UID, NOW)).toHaveLength(1);
    expect(parseOutbox('not json', UID, NOW)).toEqual([]);
    expect(parseOutbox('{}', UID, NOW)).toEqual([]);
    expect(parseOutbox(null, UID, NOW)).toEqual([]);
  });

  it('restores rows past the auto-retry age as failed', () => {
    const old = { ...toOutboxEntries([base])[0], createdAt: NOW - AUTO_RETRY_MAX_AGE_MS };
    expect(parseOutbox(JSON.stringify([old]), UID, NOW)[0].failed).toBe(true);
  });
});

describe('classifySendError', () => {
  it('treats fetch rejections, aborts and offline token refreshes as network failures', () => {
    expect(classifySendError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
    expect(classifySendError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toEqual({ kind: 'network' });
    expect(classifySendError({ code: 'auth/network-request-failed' })).toEqual({ kind: 'network' });
  });

  it('passes through a classified request error', () => {
    expect(classifySendError(new SendRequestError('nope', { kind: 'http', status: 403 }))).toEqual({
      kind: 'http',
      status: 403,
    });
  });

  it('leaves anything else unclassified (permanent)', () => {
    expect(classifySendError(new Error('That photo could not be read from your phone.'))).toBeNull();
  });
});
