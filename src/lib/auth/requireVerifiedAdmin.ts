import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { MANAGEMENT_FIELD_ROLES, resolveRoles } from '@/types';

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
  return { ok: true, uid, data: snap.data() ?? {} };
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
// Use for review lists that expose customer PII.
export async function requireVerifiedManagement(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role } = resolveRoles(c.data.role, c.data.fieldRole);
  if (role !== 'admin' && role !== 'operations') {
    return { ok: false, error: 'Forbidden: management access required', status: 403 };
  }
  return { ok: true, uid: c.uid, name: c.data.displayName || c.data.email || 'Manager' };
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
export async function requireVerifiedAdmin(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }> {
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
  const data = snap.data();
  const { role } = resolveRoles(data?.role, data?.fieldRole);
  if (role !== 'admin') {
    return { ok: false, error: 'Forbidden: admin access required', status: 403 };
  }

  return { ok: true, uid, name: data?.displayName || data?.email || 'Admin' };
}
