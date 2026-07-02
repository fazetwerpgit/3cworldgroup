'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DollarSign, LayoutDashboard, MessageSquare, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const items = [
  {
    name: 'Dashboard',
    href: '/portal/dashboard',
    icon: LayoutDashboard,
    permission: null as string | null,
  },
  { name: 'Sales', href: '/portal/sales', icon: DollarSign, permission: 'sales:read' },
  { name: 'Chat', href: '/portal/chat', icon: MessageSquare, permission: 'chat:read' },
  {
    name: 'Board',
    href: '/portal/leaderboard',
    icon: Trophy,
    permission: 'leaderboard:read',
  },
];

/**
 * Phone-first quick nav: the four everyday destinations pinned to the bottom
 * of the screen on mobile. Hidden on desktop. On the chat page it stays visible
 * on the channel-list screen but is hidden inside a conversation — the chat page
 * flags <body data-chat-thread> and globals.css collapses the bar (see the
 * data-slot hook below). While mounted it tags <body> so globals.css can
 * reserve scroll room under the bar.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  useEffect(() => {
    document.body.dataset.portalBottomNav = 'on';
    return () => {
      delete document.body.dataset.portalBottomNav;
    };
  }, []);

  const isActive = (href: string) =>
    href === '/portal/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Quick navigation"
      data-slot="mobile-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0A1F44]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          if (item.permission && !hasPermission(item.permission)) return null;
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.name} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-[#8dc63f]' : 'text-white/55 hover:text-white'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-transform duration-150 ${
                    active ? 'scale-110' : ''
                  }`}
                />
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
