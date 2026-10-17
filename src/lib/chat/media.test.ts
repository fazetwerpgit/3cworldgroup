import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAT_PENDING_PREFIX,
  MAX_UPLOAD_BYTES,
  chatPendingPath,
  parseChatPendingPath,
  readStoredAttachment,
  sanitizeAttachmentFileName,
  validateMessageAttachment,
} from './media';

const BUCKET = 'demo-bucket.appspot.com';

function objectUrl(channelId: string, name: string, bucket = BUCKET) {
  const encoded = encodeURIComponent(`chat/${channelId}/${name}`);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=tok`;
}

function pdf(extra: Record<string, unknown> = {}) {
  return {
    type: 'file',
    url: objectUrl('all-company', 'doc-1.pdf'),
    contentType: 'application/pdf',
    name: 'Rate card.pdf',
    size: 120_000,
    ...extra,
  };
}

describe('validateMessageAttachment — PDF previewUrl', () => {
  it('accepts a preview image in this channel folder, clamping its dimensions', () => {
    const previewUrl = objectUrl('all-company', 'thumb-1.webp');
    const result = validateMessageAttachment(
      pdf({ previewUrl, previewWidth: 618.7, previewHeight: 800 }),
      'all-company',
      BUCKET
    );
    expect(result).toEqual({
      ok: true,
      attachment: {
        type: 'file',
        url: objectUrl('all-company', 'doc-1.pdf'),
        contentType: 'application/pdf',
        name: 'Rate card.pdf',
        size: 120_000,
        previewUrl,
        previewWidth: 618,
        previewHeight: 800,
      },
    });
  });

  it('drops out-of-range preview dimensions but keeps the preview', () => {
    const result = validateMessageAttachment(
      pdf({ previewUrl: objectUrl('all-company', 'thumb.jpg'), previewWidth: -5, previewHeight: 99_999 }),
      'all-company',
      BUCKET
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.previewUrl).toBe(objectUrl('all-company', 'thumb.jpg'));
    expect(result.attachment.previewWidth).toBeUndefined();
    expect(result.attachment.previewHeight).toBeUndefined();
  });

  it('keeps a PDF without a preview as before', () => {
    const result = validateMessageAttachment(pdf(), 'all-company', BUCKET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment).not.toHaveProperty('previewUrl');
  });

  it.each([
    ['another channel folder', objectUrl('managers', 'thumb.webp')],
    ['another bucket', objectUrl('all-company', 'thumb.webp', 'evil-bucket.appspot.com')],
    ['a foreign host', `https://evil.example/v0/b/${BUCKET}/o/${encodeURIComponent('chat/all-company/t.webp')}`],
    ['a nested path', objectUrl('all-company', 'nested/thumb.webp')],
    ['a non-image object', objectUrl('all-company', 'other.pdf')],
    ['a non-string', 42],
  ])('rejects a preview in %s', (_label, previewUrl) => {
    const result = validateMessageAttachment(pdf({ previewUrl }), 'all-company', BUCKET);
    expect(result.ok).toBe(false);
  });
});

describe('readStoredAttachment — PDF preview', () => {
  it('round-trips a validated PDF with its preview', () => {
    const validated = validateMessageAttachment(
      pdf({ previewUrl: objectUrl('all-company', 'thumb-2.webp'), previewWidth: 800, previewHeight: 566 }),
      'all-company',
      BUCKET
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(readStoredAttachment(validated.attachment)).toEqual(validated.attachment);
  });

  it('clamps stored preview dimensions and ignores a non-https preview', () => {
    expect(
      readStoredAttachment(pdf({ previewUrl: objectUrl('all-company', 't.webp'), previewWidth: 0, previewHeight: 600 }))
    ).toMatchObject({ previewUrl: objectUrl('all-company', 't.webp'), previewHeight: 600 });
    expect(readStoredAttachment(pdf({ previewUrl: 'javascript:alert(1)', previewWidth: 600 }))).not.toHaveProperty(
      'previewUrl'
    );
  });

  it('reads an old PDF without a preview as a plain file', () => {
    const stored = readStoredAttachment(pdf());
    expect(stored).toMatchObject({ type: 'file', name: 'Rate card.pdf' });
    expect(stored).not.toHaveProperty('previewUrl');
    expect(stored).not.toHaveProperty('previewWidth');
  });
});

describe('sanitizeAttachmentFileName — content filter', () => {
  it('replaces a file name the chat filter would refuse or mask with the fallback', () => {
    expect(sanitizeAttachmentFileName('retard_list.pdf')).toBe('document.pdf');
    expect(sanitizeAttachmentFileName('fuck-this.pdf')).toBe('document.pdf');
    expect(sanitizeAttachmentFileName('Pay stub.pdf')).toBe('Pay stub.pdf');
  });
});

describe('chat pending paths (direct uploads)', () => {
  const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it("round-trips the caller's own path", () => {
    expect(chatPendingPath('rep1', ID, 'pdf')).toBe(`chat-pending/rep1/${ID}.pdf`);
    expect(parseChatPendingPath(chatPendingPath('rep1', ID, 'pdf'), 'rep1')).toEqual({ ext: 'pdf' });
    expect(parseChatPendingPath(chatPendingPath('rep1', ID, 'jpg'), 'rep1')).toEqual({ ext: 'jpg' });
  });

  it('refuses anything else', () => {
    for (const path of [
      `chat-pending/rep2/${ID}.pdf`,
      `chat-pending/rep1/a/${ID}.pdf`,
      `chat-pending/rep1/${ID}.exe`,
      `chat-pending/rep1/${ID}.jpeg`,
      `chat-pending/rep1/short.pdf`,
      `chat-pending/rep1/.${ID}.pdf`,
      `chat/rep1/${ID}.pdf`,
      `/chat-pending/rep1/${ID}.pdf`,
      null,
    ]) {
      expect(parseChatPendingPath(path, 'rep1'), String(path)).toBeNull();
    }
    expect(parseChatPendingPath(`chat-pending/a/b/${ID}.pdf`, 'a/b')).toBeNull();
    expect(parseChatPendingPath(`chat-pending//${ID}.pdf`, '')).toBeNull();
  });
});

describe('storage.rules agree with the chat upload limits', () => {
  const rules = readFileSync(resolve(__dirname, '../../../storage.rules'), 'utf8');
  const block = rules.slice(rules.indexOf(`match /${CHAT_PENDING_PREFIX}/{uid}/{name}`));

  it('has an owner-only, create-only pending folder capped at MAX_UPLOAD_BYTES', () => {
    expect(block.length).toBeGreaterThan(0);
    expect(rules).toContain(`match /${CHAT_PENDING_PREFIX}/{uid}/{name}`);
    expect(block).toContain('request.auth.uid == uid');
    expect(block).toContain('request.resource.size <= 10 * 1024 * 1024');
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(block).toMatch(/allow read, update, delete: if false;/);
    for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(block).toContain(`request.resource.contentType == '${type}'`);
    }
  });
});
