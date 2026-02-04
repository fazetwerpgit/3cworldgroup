'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  gradient: string;
  glowColor: string;
  hoverAnimation: string;
  emoji: string;
  permissions?: string[];
}

const actions: QuickAction[] = [
  {
    title: 'Log New Sale',
    description: 'Record a sale & earn points',
    href: '/portal/sales/new',
    gradient: 'from-[#8dc63f] to-[#6ba32e]',
    glowColor: 'rgba(141, 198, 63, 0.5)',
    hoverAnimation: 'group-hover:scale-110 group-hover:rotate-3',
    emoji: '💰',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    permissions: ['sales:write'],
  },
  {
    title: 'View Training',
    description: 'Level up your skills',
    href: '/portal/training',
    gradient: 'from-blue-500 to-indigo-600',
    glowColor: 'rgba(59, 130, 246, 0.5)',
    hoverAnimation: 'group-hover:scale-110 group-hover:rotate-3',
    emoji: '🎓',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    permissions: ['training:read'],
  },
  {
    title: 'Leaderboard',
    description: 'Check your ranking',
    href: '/portal/leaderboard',
    gradient: 'from-amber-500 to-orange-500',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    hoverAnimation: 'group-hover:scale-110 group-hover:rotate-3',
    emoji: '🏆',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    permissions: ['leaderboard:read'],
  },
  {
    title: 'Approve Sales',
    description: 'Review team submissions',
    href: '/portal/approvals',
    gradient: 'from-purple-500 to-pink-500',
    glowColor: 'rgba(168, 85, 247, 0.5)',
    hoverAnimation: 'group-hover:scale-110 group-hover:rotate-3',
    emoji: '✅',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    permissions: ['sales:approve'],
  },
];

export function QuickActions() {
  const { hasPermission } = useAuth();

  const visibleActions = actions.filter((action) => {
    if (!action.permissions || action.permissions.length === 0) return true;
    return action.permissions.some((p) => hasPermission(p));
  });

  if (visibleActions.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-[#0A1F44] mb-3 sm:mb-4 flex items-center gap-2">
        <span className="text-xl sm:text-2xl">⚡</span> Quick Actions
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {visibleActions.map((action, index) => (
          <Link
            key={action.title}
            href={action.href}
            className="group relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-2"
            style={{
              animationDelay: `${index * 100}ms`,
            }}
          >
            {/* Gradient overlay on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>

            {/* Glow effect */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
              style={{ background: action.glowColor }}
            ></div>

            {/* Shine effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 overflow-hidden">
              <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:left-full transition-all duration-700 ease-out"></div>
            </div>

            {/* Content */}
            <div className="relative">
              {/* Icon with animation */}
              <div className={`inline-flex p-2.5 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br ${action.gradient} text-white mb-3 sm:mb-4 shadow-lg ${action.hoverAnimation} transition-transform`}>
                <div className="w-5 h-5 sm:w-7 sm:h-7 [&>svg]:w-full [&>svg]:h-full">
                  {action.icon}
                </div>
              </div>

              {/* Floating emoji */}
              <span className="absolute top-0 right-0 text-xl sm:text-3xl opacity-20 group-hover:opacity-100 group-hover:animate-bounce transition-all duration-300">
                {action.emoji}
              </span>

              {/* Title */}
              <h3 className="font-bold text-sm sm:text-lg text-white group-hover:text-white transition-colors">
                {action.title}
              </h3>

              {/* Description */}
              <p className="text-xs sm:text-sm text-white/50 group-hover:text-white/80 transition-colors mt-1 line-clamp-2">
                {action.description}
              </p>

              {/* Arrow - hidden on mobile */}
              <div className="hidden sm:flex mt-4 items-center text-sm font-semibold text-white/40 group-hover:text-white transition-colors">
                <span>Go now</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
