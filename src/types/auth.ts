// Platform (back-office) roles
export type PlatformRole = 'admin' | 'operations';

// Field sales roles
export type FieldRole = 'entry_rep' | 'l1_manager' | 'l2_manager';

/** @deprecated Use PlatformRole | FieldRole instead */
export type UserRole = PlatformRole | FieldRole;

// Role constants - expandable enumeration
export const PlatformRoles = {
  ADMIN: 'admin',
  OPERATIONS: 'operations',
} as const;

export const FieldRoles = {
  ENTRY_REP: 'entry_rep',
  L1_MANAGER: 'l1_manager',
  L2_MANAGER: 'l2_manager',
} as const;

// Base permissions everyone gets
const BASE_PERMISSIONS = [
  'leaderboard:read',      // Everyone can see the leaderboard
  'training:read',         // Everyone can access training/university
  'shorts:read',           // Everyone can watch shorts
  'links:read',            // Everyone can access links/resources
  'chat:read',
  'chat:write',
];

// Field rep permissions: base + sales read/write
const FIELD_REP_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  'sales:read', 'sales:write',
];

// Field manager permissions: rep + approvals and user visibility
const FIELD_MANAGER_PERMISSIONS = [
  ...FIELD_REP_PERMISSIONS,
  'sales:approve',
  'users:read',
  'recruiting:read',
  'recruiting:write',
];

// Permission sets for each role - central authorization logic
export const RolePermissions: Record<PlatformRole | FieldRole, string[]> = {
  admin: [
    ...BASE_PERMISSIONS,
    'users:read', 'users:write', 'users:delete',
    'sales:read', 'sales:write', 'sales:approve', 'sales:delete',
    'training:write', 'training:delete',
    'leaderboard:manage',
    'settings:read', 'settings:write',
    'reports:read', 'reports:export',
    'territories:read', 'territories:write',
    'shorts:write',
    'links:write',
    'chat:moderate',
    'recruiting:read',
    'recruiting:write',
    'recruiting:convert',
  ],
  operations: [
    ...BASE_PERMISSIONS,
    'users:read',
    'sales:read', 'sales:write', 'sales:approve',
    'training:write',
    'leaderboard:manage',
    'reports:read',
    'territories:read', 'territories:write',
    'shorts:write',
    'links:write',
    'chat:moderate',
    'recruiting:read',
    'recruiting:write',
    'recruiting:convert',
  ],
  entry_rep: [...FIELD_REP_PERMISSIONS],
  l1_manager: [...FIELD_MANAGER_PERMISSIONS],
  l2_manager: [...FIELD_MANAGER_PERMISSIONS],
};

// Role display names for UI
export const RoleDisplayNames: Record<PlatformRole | FieldRole, string> = {
  admin: 'Administrator',
  operations: 'Operations',
  entry_rep: 'Account Executive',
  l1_manager: 'L1 Manager',
  l2_manager: 'L2 Manager',
};

const PLATFORM_ROLE_VALUES: readonly string[] = Object.values(PlatformRoles);
const FIELD_ROLE_VALUES: readonly string[] = Object.values(FieldRoles);

// Defensive mapping for raw role data read from Firestore.
// Validates values against the role unions and tolerates field roles
// stored in the `role` column (legacy sales_rep/sales_manager values were
// backfilled via scripts/backfill-roles.mjs; unknown values resolve to no role).
export function resolveRoles(
  rawRole?: string,
  rawFieldRole?: string
): { role?: PlatformRole; fieldRole?: FieldRole } {
  const fieldRole =
    rawFieldRole && FIELD_ROLE_VALUES.includes(rawFieldRole)
      ? (rawFieldRole as FieldRole)
      : undefined;

  if (rawRole && PLATFORM_ROLE_VALUES.includes(rawRole)) {
    return { role: rawRole as PlatformRole, fieldRole };
  }
  if (rawRole && FIELD_ROLE_VALUES.includes(rawRole)) {
    return { role: undefined, fieldRole: fieldRole ?? (rawRole as FieldRole) };
  }
  return { role: undefined, fieldRole };
}

// Type guard: is this value a platform (back-office) role?
export function isPlatformRole(value: string | undefined): value is PlatformRole {
  return !!value && PLATFORM_ROLE_VALUES.includes(value);
}

// The single role used for display/selection in UI.
// Platform role wins when both are set, matching permission resolution
// (AuthContext.hasPermission uses role ?? fieldRole).
export function getEffectiveRole(
  user?: { role?: PlatformRole; fieldRole?: FieldRole } | null
): PlatformRole | FieldRole | undefined {
  return user?.role ?? user?.fieldRole;
}

// User document type
export interface User {
  uid: string;
  email: string;
  displayName: string;
  role?: PlatformRole;       // Back-office users only
  fieldRole?: FieldRole;     // Field sales users only
  isIBO: boolean;
  reportsToId?: string;
  // IBO Rep linkage: a rep working under an IBO owner. The owner (a User with
  // isIBO: true) holds the business docs (LLC/SOS, insurance); the rep does not.
  iboOwnerId?: string;
  iboName?: string;
  territoryId?: string;
  phone?: string;
  // Non-sensitive contact address. DL# / SSN are NEVER stored here - they flow
  // through the background-check vendor as a reference (see types/onboarding.ts).
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  avatarUrl?: string;
  status: 'active' | 'inactive' | 'pending';
  hireDate: Date;
  createdAt: Date;
  updatedAt: Date;
  // Last time the user was active in the portal (presence heartbeat). Powers the
  // "who's active" green dot. Distinct from updatedAt (which means the record was edited).
  lastActiveAt?: Date;
}

// Auth context state type
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  // True after a pending (unapproved) account signs in or signs up — the entry
  // page shows the "pending approval" screen instead of the login form.
  pendingApproval: boolean;
}
