import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { resolveRoles } from '@/types';

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
