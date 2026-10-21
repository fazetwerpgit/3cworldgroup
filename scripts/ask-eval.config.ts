import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Runs scripts/ask-eval.mts only (real, paid DeepSeek calls): never part of `npm test`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  test: { environment: 'node', include: ['scripts/ask-eval.mts'], root: path.resolve(__dirname, '..') },
});
