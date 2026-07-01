import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { getEffectiveRole, resolveRoles, PlatformRole, FieldRole } from '@/types';

// The verified chat identity. Everything is derived from a real Firebase ID token
// (never a client-supplied userId), then the role is read from the user's own doc.
export interface ChatUser {
  uid: string;
  displayName: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
  effectiveRole?: PlatformRole | FieldRole;
  canModerate: boolean;
}

type ChatUserResult =
  | { ok: true; user: ChatUser }
  | { ok: false; error: string; status: number };

// Verifies the caller's Firebase ID token and loads their role from Firestore.
// This is the single source of chat identity — it closes the old impersonation hole
// where routes trusted a `userId` query/body param.
export async function getVerifiedChatUser(request: NextRequest): Promise<ChatUserResult> {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };

  const snap = await adminDb.collection('users').doc(gate.uid).get();
  const data = snap.data() ?? {};

  // Deactivated users have no chat access — even with a still-valid token and a
  // retained role. This is the single gate for every chat route, so it also prevents
  // an inactive user from being re-added to a channel's memberIds.
  if (data.status !== 'active') {
    return { ok: false, error: 'Account is not active', status: 403 };
  }

  const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);

  return {
    ok: true,
    user: {
      uid: gate.uid,
      displayName: gate.name || data.displayName || data.email || '3C User',
      role,
      fieldRole,
      effectiveRole: getEffectiveRole({ role, fieldRole }),
      canModerate: role === 'admin' || role === 'operations',
    },
  };
}
