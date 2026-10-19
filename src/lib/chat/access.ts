import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import { isDemoAccount } from '@/lib/users/demoAccount';
import { memberName } from '@/lib/chat/memberDisplay';
import { getEffectiveRole, isManagementRole, isSolarRole, resolveRoles, PlatformRole, FieldRole, SolarRole } from '@/types';

// The verified chat identity. Everything is derived from a real Firebase ID token
// (never a client-supplied userId), then the role is read from the user's own doc.
export interface ChatUser {
  uid: string;
  displayName: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
  /** users/{uid}.solarRole when valid: reaches the company-wide channels (canAccessChatChannel). */
  solarRole?: SolarRole;
  effectiveRole?: PlatformRole | FieldRole;
  canModerate: boolean;
  /** users/{uid}.demoAccount === true: denied every channel except a demo sandbox, extras included. */
  demoAccount: boolean;
  /** The account email (email or the older Email field), used to recognize sandbox staff. */
  email?: string;
  /** Whether they accepted the one-time chat agreement (users/{uid}.chatTermsAcceptedAt). */
  chatTermsAccepted?: boolean;
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

  // This is the single status gate for every chat route: active users and hires
  // mid-onboarding may chat, while inactive users cannot be re-added to a
  // channel's memberIds, even if they retain a role and valid token.
  if (data.status !== 'active' && !isOnboardingUser(data)) {
    return { ok: false, error: 'Account is not active', status: 403 };
  }

  // A demo account has no role, so it reaches no audience: the only channel it
  // can read or post in is a demo sandbox (userCanAccessChannelDoc), which no
  // real user other than Jacob ever sees.
  const demoAccount = isDemoAccount(data);
  const { role, fieldRole } = demoAccount ? {} : resolveRoles(data.role, data.fieldRole);

  return {
    ok: true,
    user: {
      uid: gate.uid,
      // Stamped as authorName on messages, previews, reply quotes and pushes, so it
      // must never be a full email: gate.name falls back to the raw email, while
      // memberName uses only its local-part (same rule as the member lists).
      displayName: memberName({ displayName: data.displayName, email: data.email || gate.email }),
      role,
      fieldRole,
      ...(!demoAccount && isSolarRole(data.solarRole) ? { solarRole: data.solarRole } : {}),
      effectiveRole: getEffectiveRole({ role, fieldRole }),
      canModerate: isManagementRole(role),
      demoAccount,
      email: gate.email || undefined,
      chatTermsAccepted: !!data.chatTermsAcceptedAt,
    },
  };
}
