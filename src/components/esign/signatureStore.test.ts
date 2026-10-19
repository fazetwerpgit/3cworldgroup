// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSignature, loadSignature, saveSignature, type StoredSignature } from './signatureStore';

const SIGNATURE: StoredSignature = {
  png: 'data:image/png;base64,iVBORw0KGgo=',
  method: 'draw',
};

const OWNER = 'uid-rep-1';

describe('signatureStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round trips a saved signature', () => {
    saveSignature(SIGNATURE, OWNER);
    expect(loadSignature(OWNER)).toEqual(SIGNATURE);
  });

  it('keeps the typed method distinct from the drawn one', () => {
    saveSignature({ png: SIGNATURE.png, method: 'type' }, OWNER);
    expect(loadSignature(OWNER)?.method).toBe('type');
  });

  it("never hands one person's signature to another", () => {
    saveSignature(SIGNATURE, 'invite:token-hire');
    expect(loadSignature('uid-manager')).toBeNull();
    expect(loadSignature('invite:token-other')).toBeNull();
    expect(loadSignature('invite:token-hire')).toEqual(SIGNATURE);
  });

  it('does not store or return a signature without an owner', () => {
    saveSignature(SIGNATURE, '');
    expect(sessionStorage.getItem('esign.signature')).toBeNull();
    saveSignature(SIGNATURE, OWNER);
    expect(loadSignature('')).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(loadSignature(OWNER)).toBeNull();
  });

  it('clears the stored signature', () => {
    saveSignature(SIGNATURE, OWNER);
    clearSignature();
    expect(loadSignature(OWNER)).toBeNull();
  });

  it('returns null for unparseable storage content', () => {
    sessionStorage.setItem('esign.signature', 'not json');
    expect(loadSignature(OWNER)).toBeNull();
  });

  it.each([
    ['a non-object', '"just a string"'],
    ['a missing method', JSON.stringify({ png: SIGNATURE.png, owner: OWNER })],
    ['an unknown method', JSON.stringify({ png: SIGNATURE.png, method: 'stamp', owner: OWNER })],
    ['a non-png data url', JSON.stringify({ png: 'data:image/jpeg;base64,xx', method: 'draw', owner: OWNER })],
    ['an unowned (legacy) signature', JSON.stringify(SIGNATURE)],
  ])('returns null for %s', (_label, raw) => {
    sessionStorage.setItem('esign.signature', raw);
    expect(loadSignature(OWNER)).toBeNull();
  });

  it('never throws when storage itself throws', () => {
    const blocked = () => {
      throw new Error('storage disabled');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

    expect(() => saveSignature(SIGNATURE, OWNER)).not.toThrow();
    expect(loadSignature(OWNER)).toBeNull();
    expect(() => clearSignature()).not.toThrow();
  });
});
