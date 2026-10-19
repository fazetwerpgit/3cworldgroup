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
import { FieldRoles, PlatformRoles, resolveRoles } from '@/types/auth';

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

describe('sanitizeAttachmentFileName — truncation', () => {
  it('never leaves a lone surrogate when the cut lands inside an emoji', () => {
    // 120 - '.pdf'(4) - 1 = 115 code units kept; unit 115 is the high half of 🔥.
    const name = sanitizeAttachmentFileName(`${'a'.repeat(114)}${'🔥'.repeat(10)}.pdf`);
    expect(name).toBe(`${'a'.repeat(114)}….pdf`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(name)).toBe(false);
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

  it('gates on resolveRoles: a valid fieldRole, or a legacy field role stored in role', () => {
    expect(block).toContain('allow create: if canReadTraining()');
    const fn = (name: string) => {
      const start = rules.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      return rules.slice(start, rules.indexOf('\n    }', start));
    };
    expect(fn('canReadTraining')).toContain("data.get('status', null) == 'pending' && hasFieldRole(data)");
    expect(fn('hasFieldRole')).toContain("data.get('fieldRole', null) in fieldRoleValues()");
    expect(fn('hasFieldRole')).toContain("data.get('role', null) in fieldRoleValues()");
    // The rules' list is exactly the FieldRoles union, and shares nothing with
    // the platform roles (so a field role in `role` never shadows one).
    const listed = [...fn('fieldRoleValues').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual([...Object.values(FieldRoles)].sort());
    for (const role of Object.values(PlatformRoles)) expect(listed).not.toContain(role);
    expect(resolveRoles('entry_rep', undefined)).toEqual({ role: undefined, fieldRole: 'entry_rep' });
  });
});

describe('validateMessageAttachment — image url (S-10)', () => {
  const image = (url: string) => validateMessageAttachment({ type: 'image', url }, 'all-company', BUCKET);
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/chat%2Fall-company%2F`;

  it("accepts an image stored directly in this channel's folder", () => {
    expect(image(objectUrl('all-company', 'abc-123.jpg')).ok).toBe(true);
  });

  it('rejects ../ tricks that pass the prefix but load from another bucket', () => {
    expect(image(`${prefix}x/../../../other-bucket/o/pixel.png?alt=media`).ok).toBe(false);
    expect(image(`${prefix}x/%2e%2e/%2E%2E/%2e%2e/other-bucket/o/pixel.png`).ok).toBe(false);
    expect(image(`${prefix}x%2F..%2F..%2Fpixel.png`).ok).toBe(false);
    expect(image(`${prefix}x\\..\\pixel.png`).ok).toBe(false);
  });

  it('rejects another channel, a nested path and a non-image object', () => {
    expect(image(objectUrl('other-channel', 'abc.jpg')).ok).toBe(false);
    expect(image(`${prefix}sub%2Fabc.jpg?alt=media`).ok).toBe(false);
    expect(image(objectUrl('all-company', 'abc.html')).ok).toBe(false);
  });
});
