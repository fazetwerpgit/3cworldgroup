import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isOnboardingAllowedApi } from '@/lib/auth/onboardingAccess';
import { MANAGEMENT_FIELD_ROLES, resolveRoles, PlatformRole, FieldRole } from '@/types';

// The onboarding-stage status relaxation is derived from the shared API
// allowlist in onboardingAccess.ts, so route declarations cannot drift from it.

// Account-status gate. A valid Firebase ID token proves who the caller is, not
// that they are still allowed in: a self-signup writes its own 'pending' user doc
// (firestore.rules permits it so the pending screen works) and a decommissioned
// rep keeps a working refresh token after their status flips to 'inactive'.
//
// The two non-active cases are deliberately kept on separate branches:
//   'inactive' → access was revoked (decommission / User Management). No route may
//                admit it, opt-in or not.
//   'pending'  → either an unapproved self-signup (no field role, never admitted)
//                or a hired rep mid-onboarding on a path in the shared allowlist.
// Anything else (missing status, an unrecognised value) is treated as not active;
// AuthContext already refuses to sign such a doc in, so this adds no new lockout.
function checkStatus(
  data: FirebaseFirestore.DocumentData,
  onboardingPathAllowed: boolean
): { ok: true } | { ok: false; error: string; status: number } {
  if (data.status === 'active') {
    return { ok: true };
  }
  if (data.status === 'pending') {
    const { fieldRole } = resolveRoles(data.role, data.fieldRole);
    if (onboardingPathAllowed && fieldRole) {
      return { ok: true };
    }
    return { ok: false, error: 'Account is pending approval', status: 403 };
  }
  return { ok: false, error: 'Account is not active', status: 403 };
}

// Verifies a real Firebase ID token and returns the caller's uid + user doc data.
// Shared by the verified-auth helpers below. Expects: Authorization: Bearer <idToken>.
async function verifyCaller(
  request: NextRequest
): Promise<{ ok: true; uid: string; data: FirebaseFirestore.DocumentData } | { ok: false; error: string; status: number }> {
  if (!adminAuth || !adminDb) {
    return { ok: false, error: 'Auth not configured', status: 500 };
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, error: 'Missing authentication token', status: 401 };
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'Invalid authentication token', status: 401 };
  }
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) {
    return { ok: false, error: 'User not found', status: 403 };
  }
  const data = snap.data() ?? {};
  // Status before role: a decommissioned admin must read as revoked, not as a
  // role failure, and must never reach a route because their role survived.
  const status = checkStatus(data, isOnboardingAllowedApi(request.nextUrl.pathname));
  if (!status.ok) return status;
  return { ok: true, uid, data };
}

// Verifies a real token and confirms the caller is any active user (for rep
// self-submit). Returns the verified uid + name/email — the route stamps from this,
// never from client input.
export async function requireVerifiedUser(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string; email: string } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || c.uid,
    email: c.data.email || '',
  };
}

// Verifies a real token and confirms the caller is management (admin/operations).
// Use for review lists that expose customer PII. `isAdmin` distinguishes the two
// so routes can enforce the platform-role boundary (only an admin may create,
// edit or delete an admin/operations account) without a second lookup.
export async function requireVerifiedManagement(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string; isAdmin: boolean } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role } = resolveRoles(c.data.role, c.data.fieldRole);
  if (role !== 'admin' && role !== 'operations') {
    return { ok: false, error: 'Forbidden: management access required', status: 403 };
  }
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || 'Manager',
    isAdmin: role === 'admin',
  };
}

// Verifies a real token and allows the caller through when they either ARE the
// target user or are management (admin/operations). Used for self-owned
// reads/writes — a user's own onboarding, training progress, notifications —
// that managers may also act on for oversight. `targetUserId` is DATA (which
// user the route acts on), never identity: identity comes only from the token.
// `isManagement` is returned so a route can widen its scope for managers.
export async function requireVerifiedSelfOrManagement(
  request: NextRequest,
  targetUserId: string | null | undefined
): Promise<{ ok: true; uid: string; name: string; isManagement: boolean } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role } = resolveRoles(c.data.role, c.data.fieldRole);
  const isManagement = role === 'admin' || role === 'operations';
  if (!isManagement && c.uid !== targetUserId) {
    return { ok: false, error: 'Forbidden: you can only access your own data', status: 403 };
  }
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || c.uid,
    isManagement,
  };
}

// Verifies a token and allows field managers OR back-office management to submit
// (e.g. the Manager Final Interview). Broader than requireVerifiedManagement (which
// is admin/operations only) but still excludes entry reps. Returns the verified
// identity for stamping.
export async function requireVerifiedFieldManagerOrManagement(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string; email: string } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role, fieldRole } = resolveRoles(c.data.role, c.data.fieldRole);
  const allowed =
    role === 'admin' ||
    role === 'operations' ||
    (fieldRole ? MANAGEMENT_FIELD_ROLES.includes(fieldRole) : false);
  if (!allowed) {
    return { ok: false, error: 'Forbidden: manager access required', status: 403 };
  }
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || c.uid,
    email: c.data.email || '',
  };
}

// Verifies a real Firebase ID token (not a client-supplied UID) and confirms the
// caller is an admin. Use for sensitive operations (SSN/DL# reveal) where the
// trust-the-UID pattern is not acceptable. Expects: Authorization: Bearer <idToken>.
// Shares verifyCaller with the helpers above: this function used to inline its own
// copy of the token/doc lookup, which meant a gate added to verifyCaller silently
// skipped the most privileged helper in the file.
export async function requireVerifiedAdmin(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role } = resolveRoles(c.data.role, c.data.fieldRole);
  if (role !== 'admin') {
    return { ok: false, error: 'Forbidden: admin access required', status: 403 };
  }
  return { ok: true, uid: c.uid, name: c.data.displayName || c.data.email || 'Admin' };
}

// Verifies a real token and returns the caller's full resolved identity — the
// token-verified replacement for the old getRequester(clientSuppliedUid). Use it
// where a route needs the caller's role to *scope* a query or an ownership check
// rather than to hard-gate the request (e.g. "a rep sees only their own sales,
// management sees anyone's").
export async function requireVerifiedRequester(
  request: NextRequest
): Promise<
  | {
      ok: true;
      uid: string;
      name: string;
      email: string;
      role?: PlatformRole;
      fieldRole?: FieldRole;
      /** admin or operations */
      isManagement: boolean;
      /** admin only */
      isAdmin: boolean;
      /** admin, operations, or a management field role */
      isManagerOrAbove: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role, fieldRole } = resolveRoles(c.data.role, c.data.fieldRole);
  const isManagement = role === 'admin' || role === 'operations';
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || 'User',
    email: c.data.email || '',
    role,
    fieldRole,
    isManagement,
    isAdmin: role === 'admin',
    isManagerOrAbove:
      isManagement || (fieldRole ? MANAGEMENT_FIELD_ROLES.includes(fieldRole) : false),
  };
}
