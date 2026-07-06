import { describe, it, expect } from 'vitest';
import { TRAINING_CATEGORIES, ResourceCategoryConfig } from './training';

describe('training carrier categories', () => {
  it('exposes exactly the five carriers in order', () => {
    expect(TRAINING_CATEGORIES).toEqual([
      { value: 'att', label: 'AT&T' },
      { value: 'tfiber', label: 'T-Fiber' },
      { value: 'verizon_frontier', label: 'Verizon/Frontier' },
      { value: 'xfinity', label: 'Xfinity' },
      { value: 'directv', label: 'DirecTV' },
    ]);
  });

  it('has a config entry for every category value', () => {
    for (const { value } of TRAINING_CATEGORIES) {
      expect(ResourceCategoryConfig[value]).toBeDefined();
    }
  });
});
