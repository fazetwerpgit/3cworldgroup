import { describe, expect, it } from 'vitest';
import { isValidTrainingStoragePath, trainingUploadFolder } from './storagePath';

describe('training storagePath', () => {
  it('accepts one file in one upload folder', () => {
    expect(isValidTrainingStoragePath('training/3f2a-9_b/Rate card.pdf')).toBe(true);
    expect(trainingUploadFolder('training/abc123/video.mp4')).toBe('training/abc123/');
  });

  it('refuses anything that would widen the delete prefix', () => {
    for (const bad of ['training/x', 'training/', 'training//a.pdf', 'training/a/b/c.pdf', 'training/../x/a.pdf', 'training/a/..', 'other/a/b.pdf', 'training/a\\b/c.pdf', '', null, 42]) {
      expect(isValidTrainingStoragePath(bad)).toBe(false);
      expect(trainingUploadFolder(bad)).toBeNull();
    }
  });
});
