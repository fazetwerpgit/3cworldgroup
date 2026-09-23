import type { NextRequest } from 'next/server';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

// Announcements push to every rep's phone, so every method is OWNER ONLY: a
// verified token, an active account, and the owner role (admin and operations
// get 403), the same check /api/portal/owner/summary makes.
export async function requireOwner(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }> {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return gate;
  if (!gate.isOwner) return { ok: false, error: 'Forbidden: owner access required', status: 403 };
  return { ok: true, uid: gate.uid, name: gate.name };
}
