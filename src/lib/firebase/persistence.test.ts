import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The session must live in IndexedDB. In the iOS app (WKWebView) localStorage
// is flushed to disk lazily, and a session moved there by setPersistence could
// be lost when the app was left (or killed) soon after signing in: the rep came
// back to the login form. Auth is created with IndexedDB first
// (firebase/config.ts); nothing may switch it to another persistence.

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('auth persistence', () => {
  it('creates Auth with IndexedDB as the first persistence', () => {
    const config = readFileSync(join(SRC, 'lib/firebase/config.ts'), 'utf8');
    expect(config).toMatch(/persistence:\s*\[\s*indexedDBLocalPersistence\s*,/);
  });

  it('never calls setPersistence on the main Auth instance', () => {
    const offenders = sourceFiles(SRC).filter((file) => /\bsetPersistence\s*\(/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
