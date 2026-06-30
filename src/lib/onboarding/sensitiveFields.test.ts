import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('buildSensitiveDoc', () => {
  it('encrypts a valid SSN + DL# and records last4', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ ssn: '123-45-6789', dlNumber: 'D1234567', backgroundCheckAuth: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.ssnLast4).toBe('6789');
      expect(r.doc.dlLast4).toBe('4567');
      expect(r.doc.backgroundCheckAuth).toBe(true);
      expect(r.doc.ssnEncrypted).toBeDefined();
      expect(r.doc.ssnEncrypted).not.toContain('123456789');
    }
  });

  it('rejects an SSN that is not 9 digits', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    expect(buildSensitiveDoc({ ssn: '12345' }).ok).toBe(false);
  });

  it('allows omitting fields (all optional)', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ backgroundCheckAuth: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.ssnEncrypted).toBeUndefined();
      expect(r.doc.backgroundCheckAuth).toBe(false);
    }
  });

  it('round-trips via revealSensitive', async () => {
    const { buildSensitiveDoc, revealSensitive } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ ssn: '123-45-6789', dlNumber: 'D1234567' });
    if (!r.ok) throw new Error('expected ok');
    const revealed = revealSensitive({
      ssnEncrypted: r.doc.ssnEncrypted,
      dlNumberEncrypted: r.doc.dlNumberEncrypted,
    });
    expect(revealed.ssn).toBe('123456789'); // stored stripped of separators
    expect(revealed.dlNumber).toBe('D1234567');
  });

  it('reveals undefined when nothing encrypted', async () => {
    const { revealSensitive } = await import('./sensitiveFields');
    const revealed = revealSensitive({});
    expect(revealed.ssn).toBeUndefined();
    expect(revealed.dlNumber).toBeUndefined();
  });
});
