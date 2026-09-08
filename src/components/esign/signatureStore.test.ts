// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSignature, loadSignature, saveSignature, type StoredSignature } from './signatureStore';

const SIGNATURE: StoredSignature = {
  png: 'data:image/png;base64,iVBORw0KGgo=',
  method: 'draw',
};

describe('signatureStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round trips a saved signature', () => {
    saveSignature(SIGNATURE);
    expect(loadSignature()).toEqual(SIGNATURE);
  });

  it('keeps the typed method distinct from the drawn one', () => {
    saveSignature({ png: SIGNATURE.png, method: 'type' });
    expect(loadSignature()?.method).toBe('type');
  });

  it('returns null when nothing is stored', () => {
    expect(loadSignature()).toBeNull();
  });

  it('clears the stored signature', () => {
    saveSignature(SIGNATURE);
    clearSignature();
    expect(loadSignature()).toBeNull();
  });

  it('returns null for unparseable storage content', () => {
    sessionStorage.setItem('esign.signature', 'not json');
    expect(loadSignature()).toBeNull();
  });

  it.each([
    ['a non-object', '"just a string"'],
    ['a missing method', JSON.stringify({ png: SIGNATURE.png })],
    ['an unknown method', JSON.stringify({ png: SIGNATURE.png, method: 'stamp' })],
    ['a non-png data url', JSON.stringify({ png: 'data:image/jpeg;base64,xx', method: 'draw' })],
  ])('returns null for %s', (_label, raw) => {
    sessionStorage.setItem('esign.signature', raw);
    expect(loadSignature()).toBeNull();
  });

  it('never throws when storage itself throws', () => {
    const blocked = () => {
      throw new Error('storage disabled');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

    expect(() => saveSignature(SIGNATURE)).not.toThrow();
    expect(loadSignature()).toBeNull();
    expect(() => clearSignature()).not.toThrow();
  });
});
