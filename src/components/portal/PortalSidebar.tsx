'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import { MobileBottomNav } from '@/components/portal/MobileBottomNav';
import { UserRole } from '@/types';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  permissions?: string[];
  roles?: UserRole[]; // Restrict to specific roles (e.g. field-only pages)
}

interface NavSectionProps {
  title: string;
  items: NavItem[];
  canAccessItem: (item: NavItem) => boolean;
  isActive: (href: string) => boolean;
  onLinkClick: () => void;
}

// Top of the sidebar: the everyday destinations. Team Chat and Leaderboard are
// pulled up near the top because the team lives in them.
const mainItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/portal/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: 'Team Chat',
    href: '/portal/chat',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 4.5V6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 2.5z" />
      </svg>
    ),
    permissions: ['chat:read'],
  },
  {
    name: 'Leaderboard',
    href: '/portal/leaderboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    permissions: ['leaderboard:read'],
  },
  {
    name: 'Sales',
    href: '/portal/sales',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    permissions: ['sales:read'],
  },
  {
    name: 'Calls Schedule',
    href: '/portal/calls',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'My Onboarding',
    href: '/portal/onboarding',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ['entry_rep', 'l1_manager', 'l2_manager'],
  },
];

// The rebuilt intake forms, tucked into a collapsible "Forms" folder so they
// don't crowd the main list.
const formItems: NavItem[] = [
  {
    name: 'Fiber Report',
    href: '/portal/fiber-report',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    name: 'Expedite Order',
    href: '/portal/expedite-order',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    name: 'Payroll Dispute',
    href: '/portal/payroll-dispute',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: 'Leads Request',
    href: '/portal/leads-request',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    name: 'Manager Interview',
    href: '/portal/manager-interview',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    roles: ['admin', 'operations', 'l1_manager', 'l2_manager'],
  },
];

// Learning + reference, at the bottom of the main nav. Shorts now lives inside
// University as a tab, so it's no longer its own item.
const resourceItems: NavItem[] = [
  {
    name: 'University',
    href: '/portal/training',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    permissions: ['training:read'],
  },
  {
    name: 'Links',
    href: '/portal/links',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    permissions: ['links:read'],
  },
  {
    name: 'Pay Structure',
    href: '/portal/pay-structure',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

// Operations-specific items
const operationsItems: NavItem[] = [
  {
    name: 'Onboarding Review',
    href: '/portal/admin/onboarding',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'University Content',
    href: '/portal/admin/university',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332-.477-4.5-1.253" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Fiber Reports',
    href: '/portal/admin/fiber-reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Expedite Orders',
    href: '/portal/admin/expedite-orders',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Payroll Disputes',
    href: '/portal/admin/payroll-disputes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h4m-9 4h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Manager Interviews',
    href: '/portal/admin/manager-interviews',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Leads Requests',
    href: '/portal/admin/leads-requests',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Recruiting Pipeline',
    href: '/portal/admin/pipeline',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Recruit Onboarding',
    href: '/portal/admin/recruiting',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3M12 14a4 4 0 10-8 0v1h8v-1zm-4-6a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
    roles: ['admin', 'operations', 'l1_manager', 'l2_manager'],
  },
  {
    name: 'Email Templates',
    href: '/portal/admin/email-templates',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Pending Approvals',
    href: '/portal/approvals',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    permissions: ['sales:approve'],
  },
  {
    name: 'Bug Reports',
    href: '/portal/admin/bug-reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
];

const adminItems: NavItem[] = [
  {
    name: 'User Management',
    href: '/portal/admin/users',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    permissions: ['users:read'],
  },
  {
    name: 'Form Options',
    href: '/portal/admin/form-options',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    name: 'Chat Channels',
    href: '/portal/admin/chat-channels',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m-7 7V5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H8l-4 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h5m-2.5-2.5v5" />
      </svg>
    ),
  },
  {
    name: 'System Settings',
    href: '/portal/admin/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    permissions: ['settings:read'],
  },
];

// One nav row. Shared by the flat sections and the collapsible Forms folder so
// every link looks and behaves identically. Quiet at rest: icon + label, a
// 2px lime rail and white/10 pill mark the active route.
function NavLink({
  item,
  active,
  onLinkClick,
  nested = false,
}: {
  item: NavItem;
  active: boolean;
  onLinkClick: () => void;
  nested?: boolean;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onLinkClick}
        className={`group relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors duration-150 ${
          nested ? 'pl-4 pr-3' : 'px-3'
        } ${
          active
            ? 'bg-white/10 font-medium text-white'
            : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        {active && (
          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[#8dc63f]" />
        )}
        <span
          className={`shrink-0 transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px] ${
            active ? 'text-[#8dc63f]' : 'text-white/45 group-hover:text-white/80'
          }`}
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
      </Link>
    </li>
  );
}

// A collapsible sidebar section. Every group is collapsible now (matching the
// Forms folder). Open state persists per-section in localStorage, and a section
// force-opens when one of its routes is active so you never lose your place.
function CollapsibleNavSection({
  title,
  items,
  canAccessItem,
  isActive,
  onLinkClick,
  defaultOpen = true,
}: NavSectionProps & { defaultOpen?: boolean }) {
  const visibleItems = items.filter(canAccessItem);
  const hasActiveChild = visibleItems.some((item) => isActive(item.href));
  const storageKey = `3c-nav-${title.toLowerCase()}`;

  const [open, setOpen] = useState(defaultOpen);

  // Restore the saved open/closed state on mount (client only).
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    // Restoring after mount (not via lazy initializer) keeps the server and
    // first client render identical, avoiding a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'open') setOpen(true);
    else if (saved === 'closed') setOpen(false);
  }, [storageKey]);

  // Always show the section that contains the current page.
  const isOpen = open || hasActiveChild;

  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      // ignore storage failures
    }
  };

  if (visibleItems.length === 0) return null;

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white/70"
      >
        <span>{title}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {isOpen && (
        <ul className="mt-1 space-y-0.5">
          {visibleItems.map((item) => (
            <NavLink
              key={item.name}
              item={item}
              active={isActive(item.href)}
              onLinkClick={onLinkClick}
              nested
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PortalSidebar() {
  const pathname = usePathname();
  const { hasPermission, isRole } = useAuth();
  const { isOpen, close } = useMobileMenu();

  const isActive = (href: string) => {
    if (href === '/portal/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const canAccessItem = (item: NavItem) => {
    if (item.roles && item.roles.length > 0 && !isRole(...item.roles)) return false;
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some((p) => hasPermission(p));
  };

  const showOperationsSection = isRole('admin', 'operations', 'l1_manager', 'l2_manager');
  const showAdminSection = isRole('admin');

  // Handle link click on mobile - close menu
  const handleLinkClick = () => {
    close();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-60 bg-[#0A1F44] text-white
          min-h-[calc(100vh-4rem)] flex flex-col border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link href="/portal/dashboard" onClick={handleLinkClick} className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/10 ring-1 ring-white/15">
              <Image
                src="/logo.png"
                alt="3C World Group"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Employee Portal
              </span>
              <span className="block text-base font-semibold leading-tight text-white">3C Console</span>
            </span>
          </Link>
          <button
            onClick={close}
            className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* The everyday destinations are THE nav — no label, no collapse.
              Everything below starts folded and auto-opens on its own routes. */}
          <ul className="space-y-0.5">
            {mainItems.filter(canAccessItem).map((item) => (
              <NavLink
                key={item.name}
                item={item}
                active={isActive(item.href)}
                onLinkClick={handleLinkClick}
              />
            ))}
          </ul>

          <div className="my-4 border-t border-white/10" />

          <CollapsibleNavSection
            title="Forms"
            items={formItems}
            canAccessItem={canAccessItem}
            isActive={isActive}
            onLinkClick={handleLinkClick}
            defaultOpen={false}
          />

          <CollapsibleNavSection
            title="Resources"
            items={resourceItems}
            canAccessItem={canAccessItem}
            isActive={isActive}
            onLinkClick={handleLinkClick}
            defaultOpen={false}
          />

          {showOperationsSection && (
            <CollapsibleNavSection
              title="Operations"
              items={operationsItems}
              canAccessItem={canAccessItem}
              isActive={isActive}
              onLinkClick={handleLinkClick}
              defaultOpen={false}
            />
          )}

          {showAdminSection && (
            <CollapsibleNavSection
              title="Admin"
              items={adminItems}
              canAccessItem={canAccessItem}
              isActive={isActive}
              onLinkClick={handleLinkClick}
              defaultOpen={false}
            />
          )}
        </nav>

        <div className="border-t border-white/10 px-4 py-3">
          <Link
            href="/"
            onClick={handleLinkClick}
            className="group flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Main Site</span>
          </Link>
        </div>
      </aside>

      {/* Phone-first quick nav — rendered here because the sidebar is the one
          piece of chrome every portal page already mounts. */}
      <MobileBottomNav />
    </>
  );
}
