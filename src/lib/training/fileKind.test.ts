import { describe, it, expect } from 'vitest';
import { deriveResourceType, sanitizeFileName, isAllowedTrainingUpload, MAX_TRAINING_BYTES } from './fileKind';

describe('deriveResourceType', () => {
  it('maps video/* to video', () => expect(deriveResourceType('video/mp4')).toBe('video'));
  it('maps application/pdf to document', () => expect(deriveResourceType('application/pdf')).toBe('document'));
  it('maps image/* to document', () => expect(deriveResourceType('image/png')).toBe('document'));
});

describe('sanitizeFileName', () => {
  it('replaces spaces and strips unsafe chars', () => {
    expect(sanitizeFileName('My Slide Deck (v2).pdf')).toBe('My_Slide_Deck_v2.pdf');
  });
  it('falls back to "file" when empty', () => expect(sanitizeFileName('***')).toBe('file'));
});

describe('isAllowedTrainingUpload', () => {
  it('accepts a pdf under the cap', () => expect(isAllowedTrainingUpload('application/pdf', 1000).ok).toBe(true));
  it('accepts a video under the cap', () => expect(isAllowedTrainingUpload('video/mp4', 1000).ok).toBe(true));
  it('rejects an unsupported type', () => expect(isAllowedTrainingUpload('application/zip', 1000).ok).toBe(false));
  it('rejects over the cap', () => expect(isAllowedTrainingUpload('video/mp4', MAX_TRAINING_BYTES + 1).ok).toBe(false));
  it('rejects zero bytes', () => expect(isAllowedTrainingUpload('image/png', 0).ok).toBe(false));
});
