import { adminDb } from '@/lib/firebase/admin';
import { resolveRoles, PlatformRole, FieldRole } from '@/types';

/**
 * Server-side caller identity, resolved from a client-supplied userId.
 *
 * The portal's API routes trust a client-supplied userId and resolve the
 * caller's role from Firestore (there is no session-token verification layer).
 * This helper centralizes that lookup so privileged routes can consistently
 * gate on the caller's role instead of trusting the request body blindly.
 *
 * Mirrors the getRequester() pattern already used in recruiting/convert and
 * the isManagement() helper in email-templates.
 */
export interface Requester {
  uid: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
  name: string;
  /** admin or operations */
  isManagement: boolean;
  /** admin only */
  isAdmin: boolean;
  /** admin, operations, l1_manager, or l2_manager */
  isManagerOrAbove: boolean;
}

/**
 * Look up the caller and resolve their role. Returns null if adminDb is
 * unavailable, no userId was provided, or the user does not exist.
 */
export async function getRequester(
  userId: string | null | undefined
): Promise<Requester | null> {
  if (!adminDb || !userId) return null;

  const doc = await adminDb.collection('users').doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);

  const isManagement = role === 'admin' || role === 'operations';
  const isAdmin = role === 'admin';
  const isManagerOrAbove =
    isManagement || fieldRole === 'l1_manager' || fieldRole === 'l2_manager';

  return {
    uid: userId,
    role,
    fieldRole,
    name: data?.displayName || data?.email || 'User',
    isManagement,
    isAdmin,
    isManagerOrAbove,
  };
}

/**
 * Result of a gate check: either an allowed requester or a ready-to-return
 * error payload + HTTP status. Routes do:
 *
 *   const gate = await requireManagement(callerId);
 *   if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
 *   // gate.requester is now the verified management caller
 */
export type GateResult =
  | { ok: true; requester: Requester }
  | { ok: false; error: string; status: number };

/** Require the caller to be admin or operations. */
export async function requireManagement(
  userId: string | null | undefined
): Promise<GateResult> {
  if (!userId) {
    return { ok: false, error: 'Caller id is required', status: 400 };
  }
  const requester = await getRequester(userId);
  if (!requester) {
    return { ok: false, error: 'Caller not found', status: 403 };
  }
  if (!requester.isManagement) {
    return { ok: false, error: 'Forbidden: management access required', status: 403 };
  }
  return { ok: true, requester };
}

/** Require the caller to be an admin specifically. */
export async function requireAdmin(
  userId: string | null | undefined
): Promise<GateResult> {
  if (!userId) {
    return { ok: false, error: 'Caller id is required', status: 400 };
  }
  const requester = await getRequester(userId);
  if (!requester) {
    return { ok: false, error: 'Caller not found', status: 403 };
  }
  if (!requester.isAdmin) {
    return { ok: false, error: 'Forbidden: admin access required', status: 403 };
  }
  return { ok: true, requester };
}
