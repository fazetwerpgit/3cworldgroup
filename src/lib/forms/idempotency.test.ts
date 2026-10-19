import { describe, it, expect } from 'vitest';
import { readClientId } from './idempotency';

const h = (init?: Record<string, string>) => new Headers(init);

describe('readClientId', () => {
  it('is absent when neither the body nor the header carries one', () => {
    expect(readClientId({}, h())).toEqual({ ok: true });
    expect(readClientId({ clientId: null }, h())).toEqual({ ok: true });
    expect(readClientId({ clientId: '' }, h({ 'Idempotency-Key': '  ' }))).toEqual({ ok: true });
    expect(readClientId(null, h())).toEqual({ ok: true });
  });

  it('reads the body field or the header', () => {
    expect(readClientId({ clientId: 'abc_1-2' }, h())).toEqual({ ok: true, clientId: 'abc_1-2' });
    expect(readClientId({}, h({ 'Idempotency-Key': 'k9' }))).toEqual({ ok: true, clientId: 'k9' });
    expect(readClientId({ clientId: 'same' }, h({ 'Idempotency-Key': 'same' }))).toEqual({ ok: true, clientId: 'same' });
  });

  it('rejects bad shapes and a mismatch', () => {
    expect(readClientId({ clientId: 5 }, h()).ok).toBe(false);
    expect(readClientId({ clientId: 'a/b' }, h()).ok).toBe(false);
    expect(readClientId({ clientId: 'x'.repeat(129) }, h()).ok).toBe(false);
    expect(readClientId({}, h({ 'Idempotency-Key': 'a b' })).ok).toBe(false);
    expect(readClientId({ clientId: 'a' }, h({ 'Idempotency-Key': 'b' })).ok).toBe(false);
  });
});
