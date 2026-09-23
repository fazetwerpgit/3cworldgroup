import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Runs scripts/sale-scan-live.ts only (a real, paid Gemini call): never part of `npm test`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  test: { environment: 'node', include: ['scripts/sale-scan-live.ts'], root: path.resolve(__dirname, '..') },
});
