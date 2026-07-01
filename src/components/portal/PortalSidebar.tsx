'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
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

const navigationItems: NavItem[] = [
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
    name: 'My Onboarding',
    href: '/portal/onboarding',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ['entry_rep', 'l1_manager', 'l2_manager'],
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
    name: 'Pay Structure',
    href: '/portal/pay-structure',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
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
    name: 'Shorts',
    href: '/portal/shorts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    permissions: ['shorts:read'],
  },
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

function getNavInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function NavSection({ title, items, canAccessItem, isActive, onLinkClick }: NavSectionProps) {
  const visibleItems = items.filter(canAccessItem);
  if (visibleItems.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {title}
      </div>
      <ul className="space-y-1">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                onClick={onLinkClick}
                className={`group flex min-h-10 items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-200 ${
                  active
                    ? 'border-white/15 bg-white/[0.12] text-white'
                    : 'border-transparent text-white/68 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span
                  className={`h-5 w-1 rounded-full transition-colors ${
                    active ? 'bg-[#8dc63f]' : 'bg-transparent'
                  }`}
                />
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold ${
                    active
                      ? 'bg-[#8dc63f] text-[#0A1F44]'
                      : 'bg-white/10 text-white/72 group-hover:text-white'
                  }`}
                  aria-hidden="true"
                >
                  {getNavInitials(item.name)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span
                  className={`shrink-0 transition-colors ${
                    active ? 'text-[#8dc63f]' : 'text-white/35 group-hover:text-white/55'
                  }`}
                >
                  {item.icon}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
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
          w-[258px] bg-[#0A1F44] text-white
          min-h-[calc(100vh-4rem)] flex flex-col border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link href="/portal/dashboard" onClick={handleLinkClick} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#8dc63f] text-sm font-black text-[#0A1F44]">
              3C
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
          <NavSection
            title="Main"
            items={navigationItems}
            canAccessItem={canAccessItem}
            isActive={isActive}
            onLinkClick={handleLinkClick}
          />

          {showOperationsSection && (
            <NavSection
              title="Ops"
              items={operationsItems}
              canAccessItem={canAccessItem}
              isActive={isActive}
              onLinkClick={handleLinkClick}
            />
          )}

          {showAdminSection && (
            <NavSection
              title="Admin"
              items={adminItems}
              canAccessItem={canAccessItem}
              isActive={isActive}
              onLinkClick={handleLinkClick}
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
    </>
  );
}
