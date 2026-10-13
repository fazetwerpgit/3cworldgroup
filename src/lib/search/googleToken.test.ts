import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from './googleToken';

const KEY = { client_email: 'sa@example.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n' };

describe('parseServiceAccount', () => {
  it('reads raw JSON and base64 JSON', () => {
    const json = JSON.stringify({ ...KEY, project_id: 'p' });
    expect(parseServiceAccount(json)).toEqual(KEY);
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))).toEqual(KEY);
  });

  it('is null when missing or unreadable', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('not-json')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ client_email: 'x' }))).toBeNull();
  });
});
