// One real Gemini read of a LOCAL image through extractSaleFields (no route,
// no Firebase). For tuning the reader prompt and mapping. Only feed it
// synthetic screenshots or ones the owner supplied for tuning; never pull
// customer screenshots out of Storage for it.
//
//   SCAN_IMAGES=/path/a.jpg[,/path/b.png] [SCAN_OUT=/tmp/read.json] \
//     npx vitest run --config scripts/sale-scan-live.config.ts --silent=false
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { it } from 'vitest';
import { extractSaleFields } from '@/lib/sales/scan/extract';

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

it('reads the images', { timeout: 60_000 }, async () => {
  // @next/env skips .env.local under NODE_ENV=test, so read the one key directly.
  const local = readFileSync('.env.local', 'utf8').match(/^GEMINI_API_KEY=["']?([^"'\n]+)/m);
  const apiKey = process.env.GEMINI_API_KEY || local?.[1];
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const files = (process.env.SCAN_IMAGES ?? '').split(',').filter(Boolean);
  if (files.length === 0) throw new Error('Set SCAN_IMAGES to one or more image paths');
  const images = files.map((file) => ({ data: readFileSync(file), mimeType: MIME[extname(file).toLowerCase()] ?? 'image/jpeg' }));
  const started = performance.now();
  const outcome = await extractSaleFields(images, { apiKey });
  const ms = Math.round(performance.now() - started);
  const report = JSON.stringify({ ms, ...outcome }, null, 2);
  if (process.env.SCAN_OUT) writeFileSync(process.env.SCAN_OUT, report);
  console.log(report);
});
