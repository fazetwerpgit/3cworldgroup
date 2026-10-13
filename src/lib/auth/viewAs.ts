import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  isAdminLevel,
  isManagementRole,
  isOwner,
  MANAGEMENT_FIELD_ROLES,
  resolveRoles,
  type FieldRole,
  type PlatformRole,
} from '@/types';
import { isReadMethod, READ_ONLY_ERROR, VIEW_AS_HEADER } from './viewAsHeader';

// "View as rep": the owner reads a rep's Home, Sales and Board exactly as the
// rep sees them. OWNER ONLY and READ ONLY.
//
// The client sends `x-view-as: <rep uid>` on the GETs of those screens. A rep
// GET handler calls resolveSubject() with its verified caller: no header means
// the caller themself (every existing call is unchanged); a header from anyone
// but the owner is refused, and from the owner it names the rep whose data the
// handler reads and scopes by. Writes never honour the header: src/proxy.ts
// refuses every non-GET /api/portal/* request that carries it.

export { VIEW_AS_HEADER, READ_ONLY_ERROR, isReadMethod };

/** The header's target uid, or null when the request is not a view-as request. */
export function viewAsTarget(request: Pick<NextRequest, 'headers'>): string | null {
  const raw = request.headers.get(VIEW_AS_HEADER);
  if (raw === null) return null;
  return raw.trim();
}

/** The rep being viewed, in the shape a route reads its caller in. */
export interface SubjectIdentity {
  uid: string;
  name: string;
  email: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
  status: string;
  avatarUrl: string | null;
  isManagement: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isManagerOrAbove: boolean;
}

export type SubjectResult =
  | { ok: true; viewing: false; uid: string }
  | { ok: true; viewing: true; uid: string; ownerUid: string; target: SubjectIdentity }
  | { ok: false; error: string; status: number };

/** Firestore uids are short opaque strings; anything else is not a user. */
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function subjectFromDoc(uid: string, data: FirebaseFirestore.DocumentData): SubjectIdentity {
  const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);
  const isManagement = isManagementRole(role);
  return {
    uid,
    name: data.displayName || data.email || uid,
    email: data.email || '',
    role,
    fieldRole,
    status: typeof data.status === 'string' ? data.status : '',
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    isManagement,
    isAdmin: isAdminLevel(role),
    isOwner: isOwner(role),
    isManagerOrAbove: isManagement || (fieldRole ? MANAGEMENT_FIELD_ROLES.includes(fieldRole) : false),
  };
}

/**
 * Loads a view-as target: an existing, ACTIVE field user (no platform role). An
 * admin, operations or owner account is not a rep, so it cannot be viewed as
 * one; a pending hire's reads have side effects (e-sign auto-send) and an
 * inactive account has no screens to see.
 */
export async function loadViewAsTarget(
  targetUid: string
): Promise<{ ok: true; target: SubjectIdentity } | { ok: false; error: string; status: number }> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };
  if (!UID_RE.test(targetUid)) return { ok: false, error: 'Rep not found', status: 404 };
  const snap = await adminDb.collection('users').doc(targetUid).get();
  if (!snap.exists) return { ok: false, error: 'Rep not found', status: 404 };
  const target = subjectFromDoc(targetUid, snap.data() ?? {});
  if (target.role || !target.fieldRole) {
    return { ok: false, error: 'Only a field rep can be viewed', status: 403 };
  }
  if (target.status !== 'active') {
    return { ok: false, error: 'Only an active rep can be viewed', status: 403 };
  }
  return { ok: true, target };
}

// ---------------------------------------------------------------- audit

/** Per-instance memo: a view session writes its log row once, not per request. */
const logged = new Set<string>();

function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13).replace(/[-T]/g, '');
}

/**
 * One viewAsLog row per owner + rep + clock hour. The id is deterministic, so
 * `create` dedupes across serverless instances; the memo saves the write
 * attempt within one. A failed write is logged and never blocks the read.
 */
export async function logViewAs(ownerUid: string, targetUid: string, now = new Date()): Promise<void> {
  if (!adminDb) return;
  const hour = hourKey(now);
  const id = `${ownerUid}_${targetUid}_${hour}`;
  if (logged.has(id)) return;
  logged.add(id);
  // Keep the memo bounded on a long-lived instance.
  if (logged.size > 500) {
    for (const key of logged) {
      if (!key.endsWith(hour)) logged.delete(key);
    }
  }
  try {
    await adminDb.collection('viewAsLog').doc(id).create({
      ownerUid,
      targetUid,
      startedAt: now,
      hour,
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return;
    logged.delete(id);
    console.error('[viewAs] audit write failed', error);
  }
}

/** Test seam: forget which sessions this instance has logged. */
export function resetViewAsLogMemo() {
  logged.clear();
}

// ---------------------------------------------------------------- subject

/**
 * Whose data a rep GET handler reads. `caller` is the token-verified caller the
 * route already resolved (its uid and the owner flag from verifyCaller).
 *
 * - no `x-view-as` header → the caller (unchanged behaviour)
 * - header from a caller who is not the owner → 403 (admins included)
 * - header on a non-read method → 403 "Read-only view"
 * - header naming no user / not a field rep → 404 / 403
 * - otherwise → the rep, and one audit row per owner + rep + hour
 */
export async function resolveSubject(
  request: Pick<NextRequest, 'headers' | 'method'>,
  caller: { uid: string; isOwner?: boolean }
): Promise<SubjectResult> {
  const targetUid = viewAsTarget(request);
  if (targetUid === null) return { ok: true, viewing: false, uid: caller.uid };

  if (!isReadMethod(request.method)) return { ok: false, error: READ_ONLY_ERROR, status: 403 };
  if (caller.isOwner !== true) {
    return { ok: false, error: 'Forbidden: owner access required', status: 403 };
  }
  if (!targetUid) return { ok: false, error: 'Rep not found', status: 404 };

  const loaded = await loadViewAsTarget(targetUid);
  if (!loaded.ok) return loaded;

  await logViewAs(caller.uid, targetUid);
  return { ok: true, viewing: true, uid: targetUid, ownerUid: caller.uid, target: loaded.target };
}
