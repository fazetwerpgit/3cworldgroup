import type { UserRole } from '@/types';

// The admin hubs: pages that host several of the old admin pages as tabs.
// One definition per hub feeds the nav (an item shows when any tab is open to
// the viewer), the command palette (every tab is searchable), and the hub page
// itself (which tabs render). Each tab keeps the gate its old page had.

export interface HubTab {
  key: string;
  label: string;
  roles: UserRole[];
  permissions?: string[];
}

export interface HubConfig {
  href: string;
  /** The query parameter that picks the tab. */
  param: 'tab' | 'type';
  tabs: readonly HubTab[];
}

const PLATFORM_ROLES: UserRole[] = ['admin', 'operations'];

/** Invites (the recruiting page) is the one admin page managers can open. */
export const RECRUITING_ROLES: UserRole[] = [
  'admin',
  'operations',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'regional_manager',
  'director',
];

export const PEOPLE_HUB = {
  href: '/portal/admin/people',
  param: 'tab',
  tabs: [
    { key: 'everyone', label: 'Everyone', roles: PLATFORM_ROLES, permissions: ['users:read'] },
    { key: 'invites', label: 'Invites', roles: RECRUITING_ROLES },
    { key: 'pipeline', label: 'Pipeline', roles: PLATFORM_ROLES },
    { key: 'employee-data', label: 'Employee data', roles: ['owner'] },
  ],
} as const satisfies HubConfig;

export interface RequestTab extends HubTab {
  /** The form's review API: /api/portal/forms/<form>/review. */
  form: string;
}

export const REQUEST_TABS: readonly RequestTab[] = [
  { key: 'payroll-disputes', label: 'Payroll disputes', form: 'payroll-dispute', roles: PLATFORM_ROLES },
  { key: 'expedite-orders', label: 'Expedite orders', form: 'expedite-order', roles: PLATFORM_ROLES },
  { key: 'leads-requests', label: 'Leads requests', form: 'leads-request', roles: PLATFORM_ROLES },
  { key: 'fiber-reports', label: 'Fiber reports', form: 'fiber-report', roles: PLATFORM_ROLES },
  { key: 'manager-interviews', label: 'Manager interviews', form: 'manager-interview', roles: PLATFORM_ROLES },
  { key: 'bug-reports', label: 'Bug reports', form: 'bug-report', roles: PLATFORM_ROLES },
];

export const REQUESTS_HUB = {
  href: '/portal/admin/requests',
  param: 'type',
  tabs: REQUEST_TABS,
} as const satisfies HubConfig;

export const SETTINGS_HUB = {
  href: '/portal/admin/settings',
  param: 'tab',
  tabs: [
    { key: 'system', label: 'System', roles: ['admin'], permissions: ['settings:read'] },
    { key: 'form-options', label: 'Form options', roles: ['admin'] },
    { key: 'chat-channels', label: 'Chat channels', roles: ['admin'] },
    { key: 'email-templates', label: 'Email templates', roles: PLATFORM_ROLES },
    { key: 'university', label: 'University content', roles: PLATFORM_ROLES },
  ],
} as const satisfies HubConfig;

export function hubTabHref(hub: HubConfig, key: string): string {
  return `${hub.href}?${hub.param}=${key}`;
}

/** Everyone any tab admits: the hub's own nav gate. */
export function hubRoles(hub: HubConfig): UserRole[] {
  return [...new Set(hub.tabs.flatMap((tab) => tab.roles))];
}

export function canOpenHubTab(
  tab: HubTab,
  isRole: (...roles: UserRole[]) => boolean,
  hasPermission: (permission: string) => boolean
): boolean {
  if (!isRole(...tab.roles)) return false;
  return !tab.permissions?.length || tab.permissions.some((permission) => hasPermission(permission));
}
