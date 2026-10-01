import { adminDb } from '@/lib/firebase/admin';

export type AdminAuditAction =
  | 'user.update'
  | 'user.delete'
  | 'user.decommission'
  | 'user.reinstate'
  | 'compPlan.update';

export interface AdminAuditEntry {
  action: AdminAuditAction;
  actorUid: string;
  actorName: string;
  targetUid?: string;
  targetName?: string;
  /**
   * What changed. Field NAMES for personal data (phone, address ...), never
   * their values; before/after values only for non-personal state (status,
   * role, pay rates).
   */
  details?: Record<string, unknown>;
}

/**
 * Appends one row to adminAuditLog: who did what to whom, and when. The
 * collection is server-only (firestore.rules denies every client read and
 * write). Called after the change has been committed, so it never throws: a
 * failed write is logged loudly and must not undo or fail the admin's action.
 */
export async function writeAdminAudit(entry: AdminAuditEntry): Promise<void> {
  if (!adminDb) {
    console.error('adminAudit: database not configured, dropped', entry.action, entry.targetUid);
    return;
  }
  try {
    await adminDb.collection('adminAuditLog').add({
      action: entry.action,
      actorUid: entry.actorUid,
      actorName: entry.actorName,
      ...(entry.targetUid ? { targetUid: entry.targetUid } : {}),
      ...(entry.targetName ? { targetName: entry.targetName } : {}),
      details: entry.details ?? {},
      at: new Date(),
    });
  } catch (error) {
    console.error('adminAudit: failed to write', entry.action, entry.targetUid, error);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function leaves(value: unknown, path: string, into: Map<string, unknown>) {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, into);
  } else {
    into.set(path, value);
  }
}

/** Every leaf value that differs between two nested objects, as `path`, `from`, `to` (a missing side is `null`). */
export function changedLeaves(
  before: unknown,
  after: unknown
): Array<{ path: string; from: unknown; to: unknown }> {
  const was = new Map<string, unknown>();
  const now = new Map<string, unknown>();
  leaves(before, '', was);
  leaves(after, '', now);
  const changes: Array<{ path: string; from: unknown; to: unknown }> = [];
  for (const path of new Set([...was.keys(), ...now.keys()])) {
    const from = was.get(path) ?? null;
    const to = now.get(path) ?? null;
    if (from !== to) changes.push({ path, from, to });
  }
  return changes;
}
