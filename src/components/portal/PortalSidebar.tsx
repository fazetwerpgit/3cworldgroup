'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  emoji: string;
  permissions?: string[];
}

const navigationItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/portal/dashboard',
    emoji: '🏠',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: 'Sales',
    href: '/portal/sales',
    emoji: '💰',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    permissions: ['sales:read'],
  },
  {
    name: 'Leaderboard',
    href: '/portal/leaderboard',
    emoji: '🏆',
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
    emoji: '🎬',
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
    emoji: '🎓',
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
    emoji: '🔗',
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
    name: 'Pending Approvals',
    href: '/portal/approvals',
    emoji: '✅',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    permissions: ['sales:approve'],
  },
  {
    name: 'Territories',
    href: '/portal/territories',
    emoji: '📍',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    permissions: ['territories:read'],
  },
  {
    name: 'Manage Training',
    href: '/portal/training/manage',
    emoji: '📝',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    permissions: ['training:write'],
  },
  {
    name: 'Reports',
    href: '/portal/reports',
    emoji: '📊',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    permissions: ['reports:read'],
  },
];

const adminItems: NavItem[] = [
  {
    name: 'User Management',
    href: '/portal/admin/users',
    emoji: '👥',
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
    emoji: '⚙️',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    permissions: ['settings:read'],
  },
];

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
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some((p) => hasPermission(p));
  };

  const showOperationsSection = isRole('admin', 'operations', 'sales_manager');
  const showAdminSection = isRole('admin');

  // Filter operations items based on permissions
  const visibleOperationsItems = operationsItems.filter(canAccessItem);

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
          w-64 bg-gradient-to-b from-[#0A1F44] to-[#0f2744]
          min-h-[calc(100vh-4rem)] flex flex-col border-r border-white/5
          transform transition-transform duration-300 ease-in-out
          lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Mobile header with close button */}
        <div className="lg:hidden flex items-center justify-between px-4 py-4 border-b border-white/10">
          <span className="text-white font-bold">Menu</span>
          <button
            onClick={close}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          <ul className="space-y-1">
            {navigationItems.map((item) => {
              if (!canAccessItem(item)) return null;
              const active = isActive(item.href);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={handleLinkClick}
                    className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-[#8dc63f] to-[#7ab82e] text-white shadow-lg shadow-[#8dc63f]/20'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                      {item.icon}
                    </span>
                    <span className="font-medium flex-1">{item.name}</span>
                    <span className={`text-lg transition-all duration-200 ${active ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 scale-100'}`}>
                      {item.emoji}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Operations Section */}
          {showOperationsSection && visibleOperationsItems.length > 0 && (
            <>
              <div className="mt-8 mb-4 px-4">
                <p className="text-xs font-bold text-white/30 uppercase tracking-wider flex items-center gap-2">
                  <span>🎯</span> Operations
                </p>
              </div>
              <ul className="space-y-1">
                {visibleOperationsItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={handleLinkClick}
                        className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                          active
                            ? 'bg-gradient-to-r from-[#8dc63f] to-[#7ab82e] text-white shadow-lg shadow-[#8dc63f]/20'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                          {item.icon}
                        </span>
                        <span className="font-medium flex-1">{item.name}</span>
                        <span className={`text-lg transition-all duration-200 ${active ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 scale-100'}`}>
                          {item.emoji}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Admin Section */}
          {showAdminSection && (
            <>
              <div className="mt-8 mb-4 px-4">
                <p className="text-xs font-bold text-white/30 uppercase tracking-wider flex items-center gap-2">
                  <span>👑</span> Administration
                </p>
              </div>
              <ul className="space-y-1">
                {adminItems.map((item) => {
                  if (!canAccessItem(item)) return null;
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={handleLinkClick}
                        className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                          active
                            ? 'bg-gradient-to-r from-[#8dc63f] to-[#7ab82e] text-white shadow-lg shadow-[#8dc63f]/20'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                          {item.icon}
                        </span>
                        <span className="font-medium flex-1">{item.name}</span>
                        <span className={`text-lg transition-all duration-200 ${active ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 scale-100'}`}>
                          {item.emoji}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* Bottom section with glow */}
        <div className="p-4 border-t border-white/10">
          <Link
            href="/"
            onClick={handleLinkClick}
            className="group flex items-center gap-2 text-white/40 hover:text-white text-sm transition-all px-4 py-3 rounded-xl hover:bg-white/5"
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
