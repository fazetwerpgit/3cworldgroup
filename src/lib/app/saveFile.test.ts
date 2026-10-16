import { describe, expect, it } from 'vitest';
import { baseMimeType, bytesToBase64, shouldSaveViaApp } from './saveFile';

describe('saveFile helpers', () => {
  it('base64-encodes bytes, including large files', () => {
    expect(bytesToBase64(new TextEncoder().encode('a,b\r\n1,2'))).toBe(Buffer.from('a,b\r\n1,2').toString('base64'));
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });

  it('strips MIME parameters', () => {
    expect(baseMimeType('text/csv;charset=utf-8;')).toBe('text/csv');
    expect(baseMimeType('')).toBe('application/octet-stream');
  });

  it('never routes downloads to the app outside it', () => {
    expect(shouldSaveViaApp()).toBe(false);
  });
});
