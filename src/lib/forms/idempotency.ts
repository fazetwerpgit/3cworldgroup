import { z } from 'zod';

// Optional client-generated id that makes a form POST safe to resend. A client
// that timed out resends with the same id; the server answers with the record
// the first request made instead of creating (and announcing) a second one.
// Same shape as the 3C Doors sale-draft clientId, so it can go straight into a
// Firestore doc id next to the caller's uid.
export const clientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, 'clientId must be 1-128 letters, digits, "-" or "_"');

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Reads the id from the body's `clientId` or the `Idempotency-Key` header.
 * Neither present (or both blank): `clientId` is undefined and the request
 * behaves as a plain, non-deduplicated submission. Both present: they must
 * match.
 */
export function readClientId(
  body: unknown,
  headers: Headers
): { ok: true; clientId?: string } | { ok: false; error: string } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).clientId : undefined;
  const fromBody = raw === undefined || raw === null || raw === '' ? undefined : raw;
  const header = headers.get(IDEMPOTENCY_HEADER)?.trim() || undefined;

  if (fromBody === undefined && header === undefined) return { ok: true };

  const bodyParsed = fromBody === undefined ? undefined : clientIdSchema.safeParse(fromBody);
  if (bodyParsed && !bodyParsed.success) return { ok: false, error: 'Invalid clientId' };
  const headerParsed = header === undefined ? undefined : clientIdSchema.safeParse(header);
  if (headerParsed && !headerParsed.success) return { ok: false, error: 'Invalid Idempotency-Key' };

  const a = bodyParsed?.data;
  const b = headerParsed?.data;
  if (a !== undefined && b !== undefined && a !== b) {
    return { ok: false, error: 'clientId and Idempotency-Key do not match' };
  }
  return { ok: true, clientId: a ?? b };
}

export function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}
