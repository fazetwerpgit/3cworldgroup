// User roles - expandable enumeration
export const UserRoles = {
  ADMIN: 'admin',
  OPERATIONS: 'operations',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

// Base permissions everyone gets
const BASE_PERMISSIONS = [
  'leaderboard:read',      // Everyone can see the leaderboard
  'training:read',         // Everyone can access training/university
  'shorts:read',           // Everyone can watch shorts
  'links:read',            // Everyone can access links/resources
];

// Permission sets for each role - central authorization logic
export const RolePermissions: Record<UserRole, string[]> = {
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
  ],
  sales_manager: [
    ...BASE_PERMISSIONS,
    'users:read',
    'sales:read', 'sales:write', 'sales:approve',
    'reports:read',
  ],
  sales_rep: [
    ...BASE_PERMISSIONS,
    'sales:read', 'sales:write',
  ],
};

// Role display names for UI
export const RoleDisplayNames: Record<UserRole, string> = {
  admin: 'Administrator',
  operations: 'Operations',
  sales_manager: 'Sales Manager',
  sales_rep: 'Sales Representative',
};

// User document type
export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  managerId?: string;
  territoryId?: string;
  phone?: string;
  avatarUrl?: string;
  status: 'active' | 'inactive' | 'pending';
  hireDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Auth context state type
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}
